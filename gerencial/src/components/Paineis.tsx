import type { ReactNode } from 'react'
import { Card, Vazio } from './ui'
import { GraficoComparativo, GraficoEvolucao, GraficoRanking } from './graficos/Graficos'
import { TabelaDados } from './TabelaDados'
import { numero, moeda, percentual } from '@/lib/format'
import type { comparativo3, evolucao, ranking } from '@/lib/paineis'

type Evol = Awaited<ReturnType<typeof evolucao>>
type Comp = Awaited<ReturnType<typeof comparativo3>>
type Rank = Awaited<ReturnType<typeof ranking>>

const fmt = (v: number | null, unidade: 'qtd' | 'R$') => (v === null ? 'Não informado' : unidade === 'R$' ? moeda(v) : numero(v))

export function CardEvolucao({ titulo, dados, unidade = 'qtd', meta, rodape }: { titulo: string; dados: Evol; unidade?: 'qtd' | 'R$'; meta?: number | null; rodape?: ReactNode }) {
  const temDado = dados.some((d) => d.valor !== null)
  return (
    <Card titulo={titulo}>
      {temDado ? <GraficoEvolucao dados={dados} meta={meta} casas={0} unidade={unidade === 'R$' ? '' : ''} /> : <Vazio>Sem dados informados no ano.</Vazio>}
      <TabelaDados colunas={['Competência', 'Valor', 'Fonte']} linhas={dados.map((d) => [d.rotulo, fmt(d.valor, unidade), d.fonte === 'HISTORICO' ? 'Histórico migrado' : 'Lançamentos'])} />
      {rodape && <p className="mt-2 text-xs text-neutro">{rodape}</p>}
    </Card>
  )
}

export function CardComparativo({ titulo, c, unidade = 'qtd' }: { titulo: string; c: Comp; unidade?: 'qtd' | 'R$' }) {
  const tag = c.meses.map((m) => m.rotulo.slice(0, 3).toUpperCase()).join(' • ')
  return (
    <Card titulo={titulo} acoes={<span className="rounded-full bg-dourado/25 px-2 py-0.5 text-[11px] font-bold text-dourado-escuro">{tag}</span>}>
      {c.dados.length ? <GraficoComparativo dados={c.dados} meses={c.meses} casas={unidade === 'R$' ? 2 : 0} /> : <Vazio>Sem detalhamento por dimensão nas competências.</Vazio>}
      <TabelaDados colunas={['Item', ...c.meses.map((m) => m.rotulo)]}
        linhas={[...c.dados.map((d) => [d.dimensao, ...c.meses.map((m) => fmt(d[m.chave] as number | null, unidade))]),
          ['Total', ...c.totais.map((t) => fmt(t, unidade))]]} />
    </Card>
  )
}

export function CardRanking({ titulo, r, unidade = 'qtd', nota }: { titulo: string; r: Rank; unidade?: 'qtd' | 'R$'; nota?: string }) {
  return (
    <Card titulo={titulo}>
      {r.situacao === 'NAO_INFORMADO' ? <Vazio>Não informado no período.</Vazio>
        : r.itens.length === 0 ? <Vazio>{r.semDimensao ? 'O histórico migrado não tem este detalhamento.' : 'Nenhum item atinge o volume mínimo para ranking.'}</Vazio>
        : <GraficoRanking dados={r.itens} casas={unidade === 'R$' ? 2 : 0} />}
      <p className="mt-2 text-xs text-neutro">
        Em vinho: itens que somam até 80% do total (Pareto). Total do período: {fmt(r.total, unidade)}.
        {r.ocultos > 0 && ` ${r.ocultos} item(ns) abaixo do volume mínimo/limite não exibidos.`} {nota}
      </p>
      <TabelaDados colunas={['Item', 'Valor', 'Participação', 'Acumulado']} linhas={r.itens.map((i) => [i.dimensao, fmt(i.valor, unidade), percentual(i.participacao), percentual(i.acumulado)])} />
    </Card>
  )
}
