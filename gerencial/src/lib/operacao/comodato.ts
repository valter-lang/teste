import 'server-only'
import { mensagemErroDb, pool, q, q1, tx, type Db } from '@/lib/db'
import { errosPorCampo, type Entrada } from '@/lib/validacao/comum'
import { comodatoTentativaSchema } from '@/lib/validacao/comodato'
import type { ResultadoLinha } from './tipos'

export interface Tentativa {
  id: number
  numero: number
  data: string
  sucesso: boolean
  motivo_insucesso: string | null
  criado_em: Date
  criado_por_nome: string | null
}

export async function listarTentativas(movimentoId: number, db: Db = pool()): Promise<Tentativa[]> {
  return q<Tentativa>(
    `select t.id, t.numero, t.data, t.sucesso, t.motivo_insucesso, t.criado_em, u.nome as criado_por_nome
       from comodato_tentativa t left join usuario u on u.id = t.criado_por
      where t.movimento_id = $1 order by t.numero`, [movimentoId], db)
}

/**
 * Registra uma tentativa de execução. Sucesso conclui o movimento (situação CONCLUIDO e data
 * de conclusão); insucesso com "marcar sem êxito" encerra como SEM_EXITO com o motivo.
 */
export async function registrarTentativa(movimentoId: number, entrada: Entrada, usuarioId: string): Promise<ResultadoLinha> {
  const r = comodatoTentativaSchema.safeParse(entrada)
  if (!r.success) return { ok: false, erro: 'Revise os campos da tentativa.', erros: errosPorCampo(r.error.issues) }
  const t = r.data
  try {
    return await tx({ usuarioId }, async (db) => {
      const mov = await q1<{ data_solicitacao: string; situacao: string; excluido_em: Date | null }>(
        'select data_solicitacao, situacao, excluido_em from comodato_movimento where id = $1 for update', [movimentoId], db)
      if (!mov || mov.excluido_em) return { ok: false, erro: 'Movimento não encontrado ou excluído.' }
      if (['CONCLUIDO', 'CANCELADO'].includes(mov.situacao)) return { ok: false, erro: 'Movimento já concluído ou cancelado.' }
      if (t.data < mov.data_solicitacao) return { ok: false, erro: 'Revise os campos da tentativa.', erros: { data: 'A tentativa não pode ser anterior à solicitação.' } }
      const n = await q1<{ n: number }>('select coalesce(max(numero), 0) + 1 as n from comodato_tentativa where movimento_id = $1', [movimentoId], db)
      const ins = await db.query<{ id: number }>(
        `insert into comodato_tentativa (movimento_id, competencia, numero, data, sucesso, motivo_insucesso, criado_por)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [movimentoId, t.competencia, n!.n, t.data, t.sucesso, t.motivo_insucesso, usuarioId])
      if (t.sucesso) {
        await db.query(
          `update comodato_movimento set situacao = 'CONCLUIDO', data_conclusao = $2, motivo_insucesso = null,
                  versao = versao + 1, atualizado_por = $3, atualizado_em = now() where id = $1`, [movimentoId, t.data, usuarioId])
      } else if (t.marcar_sem_exito) {
        await db.query(
          `update comodato_movimento set situacao = 'SEM_EXITO', motivo_insucesso = $2,
                  versao = versao + 1, atualizado_por = $3, atualizado_em = now() where id = $1`, [movimentoId, t.motivo_insucesso, usuarioId])
      }
      return { ok: true, id: ins.rows[0].id }
    })
  } catch (e) {
    return { ok: false, erro: mensagemErroDb(e) }
  }
}

/** Remove uma tentativa lançada por engano (a trilha de auditoria guarda o motivo). */
export async function excluirTentativa(movimentoId: number, tentativaId: number, motivo: string, usuarioId: string): Promise<ResultadoLinha> {
  if (motivo.trim().length < 5) return { ok: false, erro: 'Informe o motivo da exclusão (mínimo de 5 caracteres).' }
  try {
    const n = await tx({ usuarioId, contexto: { motivo_exclusao: motivo.trim().slice(0, 500) } }, async (db) =>
      (await db.query('delete from comodato_tentativa where id = $1 and movimento_id = $2', [tentativaId, movimentoId])).rowCount)
    return n ? { ok: true } : { ok: false, erro: 'Tentativa não encontrada.' }
  } catch (e) {
    return { ok: false, erro: mensagemErroDb(e) }
  }
}

/**
 * Linhas sugeridas para a posição do mês: produtos do mês anterior ainda sem lançamento,
 * com a posição anterior = novos + usados do mês anterior.
 */
export async function sugestoesPosicao(competencia: string, db: Db = pool()): Promise<Entrada[]> {
  const rows = await q<{ produto: string; familia_id: number | null; unidade_id: number | null; anterior: number }>(
    `select p.produto, p.familia_id, p.unidade_id, (p.novos + p.usados) as anterior
       from comodato_posicao p
      where p.competencia = ($1::date - interval '1 month')::date and p.excluido_em is null
        and not exists (select 1 from comodato_posicao a where a.competencia = $1::date and a.excluido_em is null
                           and upper(a.produto) = upper(p.produto) and coalesce(a.unidade_id, 0) = coalesce(p.unidade_id, 0))
      order by upper(p.produto)`, [competencia], db)
  return rows.map((r) => ({
    produto: r.produto, familia_id: r.familia_id ? String(r.familia_id) : '', unidade_id: r.unidade_id ? String(r.unidade_id) : '',
    posicao_anterior: String(r.anterior), entradas: '0', saidas_novos: '0', saidas_usados: '0', ajuste: '0',
  }))
}

/** Posição anterior de um produto (novos + usados do mês anterior), para pré-preencher. */
export async function posicaoAnterior(competencia: string, produto: string, unidadeId: number | null, db: Db = pool()) {
  const r = await q1<{ n: number }>(
    `select novos + usados as n from comodato_posicao where competencia = ($1::date - interval '1 month')::date
        and upper(produto) = upper($2) and coalesce(unidade_id, 0) = coalesce($3::int, 0) and excluido_em is null`,
    [competencia, produto, unidadeId], db)
  return r?.n ?? null
}
