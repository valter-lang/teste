import { exigirPermissao } from '@/lib/auth/sessao'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { mesesDoEscopo } from '@/lib/competencia'
import { calcularPainel } from '@/lib/indicadores/motor'
import { periodosDaCompetencia } from '@/lib/fechamento'
import { evolucao, ranking } from '@/lib/paineis'
import { Grade } from '@/components/ui'
import { escopoDe } from '@/components/SeletorEscopo'
import { CabecalhoPainel } from '@/components/CabecalhoArea'
import { CardEvolucao, CardRanking } from '@/components/Paineis'

export const metadata = { title: 'Tecnologia da Informação' }

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler', 'TI')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const meses = mesesDoEscopo(comp, escopo)
  const [kpis, per, evo, status, origem, categoria, prioridade, tipo] = await Promise.all([
    calcularPainel(comp, escopo, { area: 'TI' }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    evolucao('TI_ABERTOS', comp),
    ranking('TI_ABERTOS', 'STATUS', meses),
    ranking('TI_ABERTOS', 'SISTEMA_ORIGEM', meses),
    ranking('TI_ABERTOS', 'CATEGORIA', meses, { limite: 10 }),
    ranking('TI_ABERTOS', 'PRIORIDADE', meses),
    ranking('TI_ABERTOS', 'TIPO', meses),
  ])
  return (
    <div>
      <CabecalhoPainel titulo="Tecnologia da Informação" area="TI" comp={comp} escopo={escopo} base="/ti" periodo={per.find((p) => p.area === 'TI')} kpis={kpis} />
      <Grade cols={2}>
        <CardEvolucao titulo="Chamados abertos por mês (TI + Linear/OPIVA)" dados={evo} rodape="Chamados marcados como teste são excluídos." />
        <CardRanking titulo="Situação dos chamados abertos no período" r={status} />
        <CardRanking titulo="Origem: suporte TI x desenvolvimento (Linear/OPIVA)" r={origem} />
        <CardRanking titulo="Categorias com mais chamados" r={categoria} />
        <CardRanking titulo="Prioridade" r={prioridade} />
        <CardRanking titulo="Tipo" r={tipo} />
      </Grade>
    </div>
  )
}
