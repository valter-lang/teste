import 'server-only'
import { pool, q, type Db } from '@/lib/db'

/** Saldo de peças calculado pela view saldo_estoque_peca (nunca digitado). */
export interface LinhaSaldo {
  familia_id: number
  familia: string
  item_peca_id: number | null
  item: string | null
  critico: boolean | null
  estoque_minimo: number | null
  unidade_medida: string | null
  local_estoque_id: number | null
  local: string | null
  saldo_quantidade: number
  saldo_valor: number
  ultima_movimentacao: string | null
}

export interface FiltrosSaldo {
  familiaId?: number
  localId?: number
  texto?: string
  situacao?: 'negativo' | 'abaixo_minimo' | 'critico' | ''
}

export async function listarSaldos(f: FiltrosSaldo, db: Db = pool()): Promise<LinhaSaldo[]> {
  const conds: string[] = []
  const params: unknown[] = []
  const p = (v: unknown) => { params.push(v); return `$${params.length}` }
  if (f.familiaId) conds.push(`s.familia_id = ${p(f.familiaId)}`)
  if (f.localId) conds.push(`s.local_estoque_id = ${p(f.localId)}`)
  if (f.texto) conds.push(`concat_ws(' ', fp.nome, i.codigo, i.descricao, l.nome) ilike ${p(`%${f.texto.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)}`)
  if (f.situacao === 'negativo') conds.push('s.saldo_quantidade < 0')
  if (f.situacao === 'abaixo_minimo') conds.push('i.estoque_minimo is not null and s.saldo_quantidade < i.estoque_minimo')
  if (f.situacao === 'critico') conds.push('i.critico')
  return q<LinhaSaldo>(
    `select s.familia_id, fp.nome as familia, s.item_peca_id, coalesce(i.codigo || ' — ', '') || i.descricao as item,
            i.critico, i.estoque_minimo, i.unidade_medida, s.local_estoque_id, l.nome as local,
            s.saldo_quantidade, s.saldo_valor, s.ultima_movimentacao
       from saldo_estoque_peca s
       join familia_peca fp on fp.id = s.familia_id
       left join item_peca i on i.id = s.item_peca_id
       left join local_estoque l on l.id = s.local_estoque_id
      ${conds.length ? `where ${conds.join(' and ')}` : ''}
      order by fp.nome, item nulls first, l.nome nulls first
      limit 5000`, params, db)
}
