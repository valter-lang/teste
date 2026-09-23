import 'server-only'
import { pool, q, q1, type Db } from '@/lib/db'

/** Histórico migrado da planilha (somente leitura): séries agregadas e registros detalhados. */
export async function seriesHistorico(area: string, db: Db = pool()) {
  return q<{ serie: string; registros: number; inicio: string; fim: string }>(
    `select serie, count(*)::int as registros, min(competencia) as inicio, max(competencia) as fim
       from historico_agregado where area_codigo = $1 group by serie order by serie`, [area], db)
}

export async function anosHistorico(area: string, serie: string, db: Db = pool()) {
  const r = await q<{ ano: number }>(
    `select distinct extract(year from competencia)::int as ano from historico_agregado
      where area_codigo = $1 and serie = $2 order by 1 desc`, [area, serie], db)
  return r.map((x) => x.ano)
}

export interface CelulaHistorico { valor: number; aba: string; celula: string }
export interface PivotHistorico {
  competencias: string[]
  linhas: { dimensao: string; dimensaoTipo: string | null; valores: Record<string, CelulaHistorico>; total: number }[]
  totais: Record<string, number>
  totalGeral: number
}

/** Linhas = dimensão, colunas = meses do ano, com totais (soma). */
export async function pivotHistorico(area: string, serie: string, ano: number, db: Db = pool()): Promise<PivotHistorico> {
  const rows = await q<{ dimensao: string | null; dimensao_tipo: string | null; competencia: string; valor: number; aba: string; celula: string }>(
    `select dimensao_valor as dimensao, dimensao_tipo, competencia, valor, aba, celula
       from historico_agregado
      where area_codigo = $1 and serie = $2 and extract(year from competencia) = $3
      order by dimensao_valor nulls first, competencia`, [area, serie, ano], db)
  const competencias = [...new Set(rows.map((r) => r.competencia))].sort()
  const mapa = new Map<string, PivotHistorico['linhas'][number]>()
  const totais: Record<string, number> = {}
  let totalGeral = 0
  for (const r of rows) {
    const chave = r.dimensao ?? 'Total da série'
    let l = mapa.get(chave)
    if (!l) mapa.set(chave, (l = { dimensao: chave, dimensaoTipo: r.dimensao_tipo, valores: {}, total: 0 }))
    l.valores[r.competencia] = { valor: r.valor, aba: r.aba, celula: r.celula }
    l.total += r.valor
    totais[r.competencia] = (totais[r.competencia] ?? 0) + r.valor
    totalGeral += r.valor
  }
  return { competencias, linhas: [...mapa.values()], totais, totalGeral }
}

export async function tiposDetalhe(area: string, db: Db = pool()) {
  return q<{ tipo: string; registros: number }>(
    `select tipo, count(*)::int as registros from historico_detalhe where area_codigo = $1 group by tipo order by tipo`, [area], db)
}

export async function listarDetalhes(
  area: string, f: { tipo?: string; competencia?: string; pagina: number; porPagina: number }, db: Db = pool(),
) {
  const conds = ['area_codigo = $1']
  const params: unknown[] = [area]
  if (f.tipo) { params.push(f.tipo); conds.push(`tipo = $${params.length}`) }
  if (f.competencia) { params.push(f.competencia); conds.push(`competencia = $${params.length}::date`) }
  const where = conds.join(' and ')
  const total = (await q1<{ n: number }>(`select count(*)::int as n from historico_detalhe where ${where}`, params, db))?.n ?? 0
  params.push(f.porPagina, (f.pagina - 1) * f.porPagina)
  const linhas = await q<{ id: number; tipo: string; competencia: string; dados: Record<string, unknown>; aba: string; faixa: string }>(
    `select id, tipo, competencia, dados, aba, faixa from historico_detalhe where ${where}
      order by competencia desc, id limit $${params.length - 1} offset $${params.length}`, params, db)
  return { linhas, total }
}
