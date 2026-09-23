'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { tx, q1, mensagemErroDb } from '@/lib/db'
import { EsquemaPlano } from '@/lib/planos'
import { calcularIndicador } from '@/lib/indicadores/motor'
import { competenciaAtual, somarMeses } from '@/lib/competencia'

export type EstadoForm = { erro?: string; campos?: Record<string, string>; ok?: string } | undefined

export async function salvarPlano(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirLogin()
  const bruto = Object.fromEntries(['area_codigo', 'indicador_codigo', 'competencia_origem', 'ocorrencia', 'cliente_id', 'causa_raiz', 'acao', 'entregavel',
    'responsavel_nome', 'inicio', 'prazo', 'criticidade', 'resultado_esperado'].map((k) => [k, String(fd.get(k) ?? '')]))
  const mes = String(fd.get('competencia_mes') ?? '')
  bruto.competencia_origem = /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : ''
  const p = EsquemaPlano.safeParse(bruto)
  if (!p.success) return { erro: 'Revise os campos destacados.', campos: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) }
  if (!pode(u, 'plano.editar', p.data.area_codigo)) return { erro: 'Seu perfil não pode criar planos para esta área.' }
  const id = Number(fd.get('id') || 0)
  let novoId = id
  try {
    await tx({ usuarioId: u.id }, async (db) => {
      const d = p.data
      if (id) {
        const r = await db.query(
          `update plano_acao set indicador_codigo=$2, competencia_origem=$3, ocorrencia=$4, cliente_id=$5, causa_raiz=$6, acao=$7, entregavel=$8,
             responsavel_nome=$9, inicio=$10, prazo=$11, criticidade=$12, resultado_esperado=$13, atualizado_por=$14, atualizado_em=now(), versao=versao+1
           where id=$1 and versao=$15 and area_codigo=$16 and status not in ('ENCERRADA','CANCELADA')`,
          [id, d.indicador_codigo, d.competencia_origem, d.ocorrencia, d.cliente_id, d.causa_raiz, d.acao, d.entregavel, d.responsavel_nome, d.inicio, d.prazo,
            d.criticidade, d.resultado_esperado, u.id, Number(fd.get('versao')), d.area_codigo])
        if (!r.rowCount) throw new Error('CONFLITO')
      } else {
        const r = await db.query<{ id: number }>(
          `insert into plano_acao (area_codigo, indicador_codigo, competencia_origem, ocorrencia, cliente_id, causa_raiz, acao, entregavel, responsavel_nome,
             inicio, prazo, criticidade, resultado_esperado, criado_por, atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) returning id`,
          [d.area_codigo, d.indicador_codigo, d.competencia_origem, d.ocorrencia, d.cliente_id, d.causa_raiz, d.acao, d.entregavel, d.responsavel_nome,
            d.inicio, d.prazo, d.criticidade, d.resultado_esperado, u.id])
        novoId = r.rows[0].id
      }
    })
  } catch (e) {
    if ((e as Error).message === 'CONFLITO') return { erro: 'O plano foi alterado por outra pessoa ou já foi encerrado. Recarregue a página.' }
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/planos-acao')
  redirect(`/planos-acao/${novoId}`)
}

/** Andamento e mudança de status; encerramento exige evidência e (indicador na meta ou aprovação da Diretoria). */
export async function registrarAndamento(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirLogin()
  const id = Number(fd.get('id'))
  const plano = await q1<{ area_codigo: string; indicador_codigo: string | null; status: string; versao: number }>(`select area_codigo, indicador_codigo, status, versao from plano_acao where id = $1`, [id])
  if (!plano) return { erro: 'Plano não encontrado.' }
  const novo = String(fd.get('status') || plano.status)
  const texto = String(fd.get('texto') ?? '').trim()
  const evidencia = String(fd.get('evidencia') ?? '').trim()
  const tipoEnc = String(fd.get('tipo_encerramento') ?? '')
  const eficacia = String(fd.get('eficacia') ?? '')
  const avaliacao = String(fd.get('avaliacao_eficacia') ?? '').trim()
  const aprovandoDiretoria = novo === 'ENCERRADA' && tipoEnc === 'APROVACAO_DIRETORIA'
  if (aprovandoDiretoria ? !pode(u, 'plano.aprovar_encerramento', plano.area_codigo) : !pode(u, 'plano.editar', plano.area_codigo)) return { erro: 'Seu perfil não pode executar esta ação.' }
  if (!texto) return { erro: 'Descreva o andamento.' }
  if (['ENCERRADA', 'CANCELADA'].includes(plano.status)) return { erro: 'Plano já finalizado.' }
  if (novo === 'ENCERRADA') {
    if (!evidencia) return { erro: 'Encerramento exige evidência.' }
    if (!['EFICAZ', 'NAO_EFICAZ'].includes(eficacia) || avaliacao.length < 10) return { erro: 'Registre a avaliação de eficácia.' }
    if (tipoEnc === 'META_ATINGIDA') {
      if (!plano.indicador_codigo) return { erro: 'Plano sem indicador: o encerramento exige aprovação formal da Diretoria.' }
      const ref = somarMeses(competenciaAtual(), -1)
      const r = await calcularIndicador(plano.indicador_codigo, ref, 'MES')
      if (r.status !== 'VERDE') return { erro: `O indicador ainda não voltou à meta (${r.status === 'NA' ? 'sem dado' : 'status ' + r.status} em ${ref.slice(0, 7)}). Encerre com aprovação da Diretoria ou mantenha o plano aberto.` }
    } else if (tipoEnc !== 'APROVACAO_DIRETORIA') return { erro: 'Informe o tipo de encerramento.' }
  }
  try {
    await tx({ usuarioId: u.id }, async (db) => {
      await db.query(`insert into plano_acao_andamento (plano_id, texto, status_novo, usuario_id) values ($1,$2,$3,$4)`, [id, texto, novo !== plano.status ? novo : null, u.id])
      await db.query(
        `update plano_acao set status=$2, evidencia=coalesce(nullif($3,''), evidencia), tipo_encerramento=case when $2='ENCERRADA' then $4 else tipo_encerramento end,
           encerramento_aprovado_por=case when $4='APROVACAO_DIRETORIA' and $2='ENCERRADA' then $5::uuid else encerramento_aprovado_por end,
           eficacia=coalesce(nullif($6,''), eficacia), avaliacao_eficacia=coalesce(nullif($7,''), avaliacao_eficacia),
           encerrado_em=case when $2 in ('ENCERRADA','CANCELADA') then now() else encerrado_em end,
           atualizado_por=$5, atualizado_em=now(), versao=versao+1 where id=$1`,
        [id, novo, evidencia, tipoEnc || null, u.id, eficacia, avaliacao])
    })
  } catch (e) {
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath(`/planos-acao/${id}`)
  return { ok: 'Andamento registrado.' }
}
