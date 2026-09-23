import { exigirPermissao } from '@/lib/auth/sessao'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { mesesDoEscopo } from '@/lib/competencia'
import { calcularPainel } from '@/lib/indicadores/motor'
import { periodosDaCompetencia } from '@/lib/fechamento'
import { comparativo3, evolucao, ranking } from '@/lib/paineis'
import { Grade } from '@/components/ui'
import { escopoDe } from '@/components/SeletorEscopo'
import { CabecalhoPainel } from '@/components/CabecalhoArea'
import { CardComparativo, CardEvolucao, CardRanking } from '@/components/Paineis'

export const metadata = { title: 'Estoque de peças' }

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler', 'ESTOQUE_PECAS')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const meses = mesesDoEscopo(comp, escopo)
  const [kpis, per, entEvo, saiEvo, entComp, saiPareto, intPareto, extPareto] = await Promise.all([
    calcularPainel(comp, escopo, { area: 'ESTOQUE_PECAS' }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    evolucao('EP_ENTRADA_RS', comp),
    evolucao('EP_SAIDA_RS', comp),
    comparativo3('EP_ENTRADA_RS', 'FAMILIA_PECA', comp, 8),
    ranking('EP_SAIDA_RS', 'FAMILIA_PECA', meses, { limite: 15 }),
    ranking('MI_PECAS_QTD', 'FAMILIA_PECA', meses, { limite: 10 }),
    ranking('ME_PECAS_QTD', 'FAMILIA_PECA', meses, { limite: 10 }),
  ])
  return (
    <div>
      <CabecalhoPainel titulo="Estoque de peças" area="ESTOQUE_PECAS" comp={comp} escopo={escopo} base="/estoque-pecas" periodo={per.find((p) => p.area === 'ESTOQUE_PECAS')} kpis={kpis} />
      <Grade cols={2}>
        <CardEvolucao titulo="Entradas de estoque (R$)" dados={entEvo} unidade="R$" />
        <CardEvolucao titulo="Saídas de estoque (R$)" dados={saiEvo} unidade="R$" />
        <CardComparativo titulo="Famílias com entrada" c={entComp} unidade="R$" />
        <CardRanking titulo="Saídas por família — Pareto (R$)" r={saiPareto} unidade="R$" />
        <CardRanking titulo="Consumo interno por família (quantidade)" r={intPareto} />
        <CardRanking titulo="Consumo externo por família (quantidade)" r={extPareto} />
      </Grade>
      <p className="mt-4 text-xs text-neutro">O saldo de estoque é sempre calculado a partir das movimentações (entradas, saídas, ajustes e transferências); nunca é digitado.</p>
    </div>
  )
}
