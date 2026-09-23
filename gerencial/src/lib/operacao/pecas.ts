import 'server-only'
import { q, pool, type Db } from '@/lib/db'
import type { LinhaPeca } from '@/lib/validacao/manutencao-interna'
import type { LinhaPecaEntrada } from './tipos'

/**
 * Peças utilizadas em manutenção: cada linha é um movimento_estoque SAIDA vinculado ao
 * lançamento de origem (digitação única — o estoque nunca é lançado duas vezes).
 */
export type OrigemPecas = 'INTERNA' | 'EXTERNA'
const colunaOrigem = (o: OrigemPecas) => (o === 'INTERNA' ? 'manut_interna_id' : 'chamado_externo_id')

export async function listarPecas(origem: OrigemPecas, registroId: number, db: Db = pool()): Promise<LinhaPecaEntrada[]> {
  const rows = await q<{ id: number; familia_id: number; item_peca_id: number | null; local_estoque_id: number | null; quantidade: number; valor_total: number | null }>(
    `select id, familia_id, item_peca_id, local_estoque_id, quantidade, valor_total
       from movimento_estoque
      where ${colunaOrigem(origem)} = $1 and tipo = 'SAIDA' and excluido_em is null
      order by id`,
    [registroId], db,
  )
  const txt = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  return rows.map((r) => ({
    id: String(r.id), familia_id: String(r.familia_id), item_peca_id: r.item_peca_id ? String(r.item_peca_id) : '',
    local_estoque_id: r.local_estoque_id ? String(r.local_estoque_id) : '', quantidade: txt(r.quantidade), valor_total: txt(r.valor_total),
  }))
}

/**
 * Sincroniza as linhas: atualiza as existentes, inclui as novas e exclui logicamente as removidas.
 * `dataMov` é a data do evento (define a competência do movimento).
 */
export async function sincronizarPecas(
  db: Db, origem: OrigemPecas, registroId: number, linhas: LinhaPeca[], dataMov: string,
  ctx: { usuarioId: string; referencia: string },
): Promise<void> {
  const col = colunaOrigem(origem)
  const competencia = `${dataMov.slice(0, 7)}-01`
  const existentes = await q<{ id: number }>(`select id from movimento_estoque where ${col} = $1 and excluido_em is null`, [registroId], db)
  const ids = new Set(existentes.map((e) => e.id))
  const mantidos = new Set<number>()
  for (const l of linhas) {
    if (l.id && ids.has(l.id)) {
      mantidos.add(l.id)
      await db.query(
        `update movimento_estoque
            set familia_id = $2, item_peca_id = $3, local_estoque_id = $4, quantidade = $5, valor_total = $6,
                data = $7, competencia = $8, versao = versao + 1, atualizado_por = $9, atualizado_em = now()
          where id = $1 and ${col} = $10
            and (familia_id, coalesce(item_peca_id, 0), coalesce(local_estoque_id, 0), quantidade, coalesce(valor_total, -1), data)
                is distinct from ($2, coalesce($3::int, 0), coalesce($4::int, 0), $5::numeric, coalesce($6::numeric, -1), $7::date)`,
        [l.id, l.familia_id, l.item_peca_id, l.local_estoque_id, l.quantidade, l.valor_total, dataMov, competencia, ctx.usuarioId, registroId],
      )
    } else {
      await db.query(
        `insert into movimento_estoque (competencia, data, local_estoque_id, familia_id, item_peca_id, tipo, quantidade, valor_total,
                                        motivo, documento_origem, responsavel_id, ${col}, aplicacao, origem, criado_por, atualizado_por)
         values ($1, $2, $3, $4, $5, 'SAIDA', $6, $7, $8, $9, $10, $11, $12, 'MANUAL', $10, $10)`,
        [competencia, dataMov, l.local_estoque_id, l.familia_id, l.item_peca_id, l.quantidade, l.valor_total,
          `Peça utilizada — ${ctx.referencia}`, ctx.referencia, ctx.usuarioId, registroId, origem],
      )
    }
  }
  const removidos = [...ids].filter((i) => !mantidos.has(i))
  if (removidos.length) await excluirMovimentos(db, removidos, 'Peça removida do lançamento de origem', ctx.usuarioId)
}

/** Datas do lançamento mudaram: acompanha a data/competência dos movimentos vinculados. */
export async function realinharDataPecas(db: Db, origem: OrigemPecas, registroId: number, dataMov: string, usuarioId: string) {
  await db.query(
    `update movimento_estoque set data = $2, competencia = $3, versao = versao + 1, atualizado_por = $4, atualizado_em = now()
      where ${colunaOrigem(origem)} = $1 and excluido_em is null and data <> $2`,
    [registroId, dataMov, `${dataMov.slice(0, 7)}-01`, usuarioId],
  )
}

export async function excluirPecasDe(db: Db, origem: OrigemPecas, registroId: number, usuarioId: string) {
  const r = await q<{ id: number }>(`select id from movimento_estoque where ${colunaOrigem(origem)} = $1 and excluido_em is null`, [registroId], db)
  if (r.length) await excluirMovimentos(db, r.map((x) => x.id), 'Lançamento de origem excluído', usuarioId)
}

async function excluirMovimentos(db: Db, ids: number[], motivo: string, usuarioId: string) {
  await db.query(
    `update movimento_estoque set excluido_em = now(), excluido_por = $2, motivo_exclusao = $3, versao = versao + 1
      where id = any($1::int[]) and excluido_em is null`,
    [ids, usuarioId, motivo],
  )
}
