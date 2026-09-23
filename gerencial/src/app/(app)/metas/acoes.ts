'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { tx, q1, mensagemErroDb } from '@/lib/db'

export type Estado = { erro?: string; ok?: string } | undefined
const num = z.string().trim().transform((v) => (v === '' ? null : Number(v.replace(',', '.')))).refine((v) => v === null || Number.isFinite(v), 'Número inválido.')

const Esquema = z.object({
  indicador_codigo: z.string().regex(/^[A-Z0-9_]+$/),
  ciclo: z.enum(['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']),
  tipo: z.enum(['ABSOLUTA', 'LINHA_BASE_MAIS', 'PERCENTUAL_SOBRE_LINHA_BASE', 'VARIACAO_PERIODO_ANTERIOR', 'TENDENCIA_QUEDA', 'CONTAGEM_MINIMA']),
  operador: z.enum(['>=', '<=', '=', 'ENTRE']),
  valor: num, valor_max: num, linha_base: num, tolerancia_pct: num,
  linha_base_competencia: z.string().transform((v) => (/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : null)),
  vigencia_inicio: z.string().regex(/^\d{4}-\d{2}$/, 'Informe o mês de início da vigência.').transform((v) => `${v}-01`),
  fonte_documento: z.string().trim().min(3, 'Informe o documento de origem.'),
  motivo: z.string().trim().min(10, 'Informe o motivo da alteração (mín. 10 caracteres).'),
  excecao_ciclo: z.string().transform((v) => v === 'on'),
  justificativa_excecao: z.string().trim(),
})

export async function proporMeta(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirLogin()
  const p = Esquema.safeParse(Object.fromEntries(['indicador_codigo', 'ciclo', 'tipo', 'operador', 'valor', 'valor_max', 'linha_base', 'tolerancia_pct', 'linha_base_competencia',
    'vigencia_inicio', 'fonte_documento', 'motivo', 'excecao_ciclo', 'justificativa_excecao'].map((k) => [k, String(fd.get(k) ?? '')])))
  if (!p.success) return { erro: p.error.issues[0].message }
  const d = p.data
  const def = await q1<{ area_codigo: string }>(`select area_codigo from indicador_definicao where codigo = $1 order by versao desc limit 1`, [d.indicador_codigo])
  if (!def || !pode(u, 'metas.propor', def.area_codigo)) return { erro: 'Seu perfil não pode propor metas para este indicador.' }
  if (d.excecao_ciclo && d.justificativa_excecao.length < 15) return { erro: 'Exceção de ciclo exige justificativa (mín. 15 caracteres).' }
  try {
    await tx({ usuarioId: u.id }, async (db) => {
      const v = await db.query<{ v: number }>(`select coalesce(max(versao),0)+1 v from meta where indicador_codigo=$1 and ciclo=$2`, [d.indicador_codigo, d.ciclo])
      await db.query(
        `insert into meta (indicador_codigo, versao, ciclo, tipo, operador, valor, valor_max, linha_base, linha_base_competencia, tolerancia_pct, vigencia_inicio,
           status, fonte_documento, motivo, excecao_ciclo, justificativa_excecao, criado_por)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,5),$11,'PROPOSTA',$12,$13,$14,$15,$16)`,
        [d.indicador_codigo, v.rows[0].v, d.ciclo, d.tipo, d.operador, d.valor, d.valor_max, d.linha_base, d.linha_base_competencia, d.tolerancia_pct,
          d.vigencia_inicio, d.fonte_documento, d.motivo, d.excecao_ciclo, d.justificativa_excecao || null, u.id])
    })
  } catch (e) {
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/metas')
  return { ok: 'Proposta registrada; aguarda aprovação da Diretoria.' }
}

/** Aprovação: a meta anterior do mesmo ciclo recebe fim de vigência (histórico preservado). */
export async function decidirMeta(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirLogin()
  const id = Number(fd.get('id'))
  const decisao = String(fd.get('decisao'))
  if (!pode(u, 'metas.aprovar')) return { erro: 'Somente a Diretoria aprova metas.' }
  try {
    await tx({ usuarioId: u.id }, async (db) => {
      const m = (await db.query<{ indicador_codigo: string; ciclo: string; vigencia_inicio: string; status: string }>(`select indicador_codigo, ciclo, vigencia_inicio::text, status from meta where id=$1 for update`, [id])).rows[0]
      if (!m || m.status !== 'PROPOSTA') throw Object.assign(new Error('Meta não está como proposta.'), { code: 'P0001' })
      if (decisao === 'REJEITAR') {
        await db.query(`update meta set status='REJEITADA', aprovado_por=$2, aprovado_em=now() where id=$1`, [id, u.id])
        return
      }
      await db.query(`update meta set vigencia_fim = ($3::date - 1) where indicador_codigo=$1 and ciclo=$2 and status='APROVADA' and vigencia_fim is null and vigencia_inicio < $3`, [m.indicador_codigo, m.ciclo, m.vigencia_inicio])
      await db.query(`update meta set status='APROVADA', aprovado_por=$2, aprovado_em=now() where id=$1`, [id, u.id])
    })
  } catch (e) {
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/metas')
  return { ok: decisao === 'REJEITAR' ? 'Proposta rejeitada.' : 'Meta aprovada e vigente.' }
}
