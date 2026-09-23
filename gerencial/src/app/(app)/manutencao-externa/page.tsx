import { exigirPermissao } from '@/lib/auth/sessao'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { mesesDoEscopo } from '@/lib/competencia'
import { calcularPainel } from '@/lib/indicadores/motor'
import { periodosDaCompetencia } from '@/lib/fechamento'
import { comparativo3, evolucao, ranking, volumeMinimoRanking } from '@/lib/paineis'
import { Grade } from '@/components/ui'
import { escopoDe } from '@/components/SeletorEscopo'
import { CabecalhoPainel } from '@/components/CabecalhoArea'
import { CardComparativo, CardEvolucao, CardRanking } from '@/components/Paineis'

export const metadata = { title: 'Manutenção externa' }

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler', 'MANUT_EXTERNA')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const meses = mesesDoEscopo(comp, escopo)
  const minimo = await volumeMinimoRanking()
  const [kpis, per, atend, reinc, porEquip, evoCham, clientes, redes, motivos, pecas, trocas] = await Promise.all([
    calcularPainel(comp, escopo, { area: 'MANUT_EXTERNA' }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    comparativo3('ME_ATENDIMENTOS', 'TECNICO', comp),
    comparativo3('ME_REINCIDENCIAS', 'TECNICO', comp),
    comparativo3('ME_CHAMADOS', 'FAMILIA_EQUIP', comp),
    evolucao('ME_CHAMADOS', comp),
    ranking('ME_CHAMADOS', 'CLIENTE', meses, { limite: 12, volumeMinimo: minimo }),
    ranking('ME_CHAMADOS', 'REDE', meses, { limite: 12, volumeMinimo: minimo }),
    ranking('ME_DESNECESSARIOS', 'MOTIVO', meses),
    ranking('ME_PECAS_QTD', 'FAMILIA_PECA', meses, { limite: 15 }),
    evolucao('ME_TROCAS_QTD', comp),
  ])
  return (
    <div>
      <CabecalhoPainel titulo="Manutenção externa" area="MANUT_EXTERNA" comp={comp} escopo={escopo} base="/manutencao-externa" periodo={per.find((p) => p.area === 'MANUT_EXTERNA')} kpis={kpis} />
      <Grade cols={2}>
        <CardComparativo titulo="Atendimentos por técnico" c={atend} />
        <CardComparativo titulo="Reincidências por técnico" c={reinc} />
        <CardComparativo titulo="Chamados por família de equipamento" c={porEquip} />
        <CardEvolucao titulo="Evolução mensal dos chamados externos" dados={evoCham} rodape="Chamados não cancelados. Volume por equipamento; atendimentos por técnico e classificação necessário/desnecessário podem divergir (pendência de homologação)." />
        <CardRanking titulo="Clientes com mais chamados" r={clientes} nota={`Volume mínimo para ranking: ${minimo} chamados.`} />
        <CardRanking titulo="Chamados por rede" r={redes} nota={`Volume mínimo para ranking: ${minimo} chamados.`} />
        <CardRanking titulo="Chamados desnecessários por motivo" r={motivos} />
        <CardRanking titulo="Peças utilizadas externamente — Pareto" r={pecas} />
        <CardEvolucao titulo="Trocas de equipamento solicitadas pela manutenção" dados={trocas} />
      </Grade>
    </div>
  )
}
