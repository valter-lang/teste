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

export const metadata = { title: 'Manutenção interna' }

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler', 'MANUT_INTERNA')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const meses = mesesDoEscopo(comp, escopo)
  const [kpis, per, recComp, recEvo, sucComp, sucEvo, lavComp, pecas] = await Promise.all([
    calcularPainel(comp, escopo, { area: 'MANUT_INTERNA' }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    comparativo3('MI_RECUPERADOS', 'FAMILIA_EQUIP', comp),
    evolucao('MI_RECUPERADOS', comp),
    comparativo3('MI_SUCATEADOS', 'FAMILIA_EQUIP', comp),
    evolucao('MI_SUCATEADOS', comp),
    comparativo3('MI_LAVAGENS', 'FAMILIA_EQUIP', comp),
    ranking('MI_PECAS_QTD', 'FAMILIA_PECA', meses, { limite: 15 }),
  ])
  const meta = (c: string) => kpis.find((k) => k.codigo === c)?.alvo ?? null
  return (
    <div>
      <CabecalhoPainel titulo="Manutenção interna" area="MANUT_INTERNA" comp={comp} escopo={escopo} base="/manutencao-interna" periodo={per.find((p) => p.area === 'MANUT_INTERNA')} kpis={kpis} />
      <Grade cols={2}>
        <CardComparativo titulo="Recuperações por família de equipamento" c={recComp} />
        <CardEvolucao titulo="Evolução mensal das recuperações" dados={recEvo} meta={escopo === 'MES' ? meta('MI_RECUPERACOES') : null} />
        <CardComparativo titulo="Sucateamento por família" c={sucComp} />
        <CardEvolucao titulo="Evolução mensal do sucateamento" dados={sucEvo} meta={escopo === 'MES' ? meta('MI_SUCATEADOS') : null} />
        <CardComparativo titulo="Lavagens/higienizações por família" c={lavComp} />
        <CardRanking titulo="Peças utilizadas internamente — Pareto" r={pecas} />
      </Grade>
    </div>
  )
}
