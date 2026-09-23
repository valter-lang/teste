import 'server-only'
import { q1 } from './db'
import { mesesDoEscopo, somarMeses } from './competencia'
import { competenciaCurta } from './format'
import { lerSerie, totalPorDimensao, pareto, type Dimensao, type SerieCodigo } from './indicadores/series'

/** Evolução mensal (jan..competência) do total de uma série. */
export async function evolucao(codigo: SerieCodigo, comp: string) {
  const meses = mesesDoEscopo(comp, 'ANO')
  const r = await lerSerie(codigo, meses)
  return meses.map((m) => ({ rotulo: competenciaCurta(m), valor: r.porMes[m].valor, atual: m === comp, fonte: r.porMes[m].fonte }))
}

/** Comparativo por dimensão das 3 últimas competências (padrão "MAI • JUN • JUL"). */
export async function comparativo3(codigo: SerieCodigo, dim: Dimensao, comp: string, limite = 12) {
  const meses = [somarMeses(comp, -2), somarMeses(comp, -1), comp]
  const r = await lerSerie(codigo, meses, dim)
  const totais = totalPorDimensao({ ...r, pontos: r.pontos.filter((p) => p.competencia === comp) })
  const ordem = [...new Set([...totais.map((t) => t.dimensao), ...totalPorDimensao(r).map((t) => t.dimensao)])].slice(0, limite)
  const dados = ordem.map((d) => {
    const linha: Record<string, string | number | null> = { dimensao: d }
    for (const m of meses) linha[m] = r.porMes[m].situacao === 'OK' ? r.pontos.filter((p) => p.competencia === m && p.dimensao === d).reduce((s, p) => s + p.valor, 0) : null
    return linha as { dimensao: string } & Record<string, number | null>
  })
  return { dados, meses: meses.map((m) => ({ chave: m, rotulo: competenciaCurta(m), situacao: r.porMes[m].situacao })), totais: meses.map((m) => r.porMes[m].valor) }
}

export async function volumeMinimoRanking(): Promise<number> {
  const r = await q1<{ v: number }>(`select (valor #>> '{}')::float8 as v from configuracao where chave = 'ranking.volume_minimo'`)
  return r?.v ?? 3
}

/** Ranking/Pareto de uma série no intervalo; aplica volume mínimo quando pedido. */
export async function ranking(codigo: SerieCodigo, dim: Dimensao, meses: string[], opts: { limite?: number; volumeMinimo?: number } = {}) {
  const r = await lerSerie(codigo, meses, dim)
  const itens = pareto(totalPorDimensao(r))
  const filtrados = itens.filter((i) => i.valor >= (opts.volumeMinimo ?? 0))
  const situacao = meses.every((m) => r.porMes[m].situacao === 'OK') ? 'OK' : meses.some((m) => r.porMes[m].situacao === 'OK') ? 'PARCIAL' : 'NAO_INFORMADO'
  return {
    itens: filtrados.slice(0, opts.limite ?? 15).map((i) => ({ dimensao: i.dimensao, valor: i.valor, acumulado: i.acumulado, destaque: i.classeA, participacao: i.participacao })),
    ocultos: itens.length - Math.min(filtrados.length, opts.limite ?? 15),
    total: itens.reduce((s, i) => s + i.valor, 0),
    situacao,
    semDimensao: r.pontos.length === 0 && situacao !== 'NAO_INFORMADO',
  }
}
