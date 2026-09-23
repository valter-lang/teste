import { Cabecalho, Etiqueta, Grade } from './ui'
import { AbasArea } from './AbasArea'
import { BarraFiltros } from './BarraFiltros'
import { KpiCard } from './KpiCard'
import type { AreaCodigo } from '@/lib/auth/permissoes'
import type { Escopo } from '@/lib/competencia'
import type { Resultado } from '@/lib/indicadores/motor'
import { ROTULO_STATUS, type Periodo } from '@/lib/fechamento'
import { competenciaLonga } from '@/lib/format'

export function CabecalhoPainel({ titulo, area, comp, escopo, base, periodo, kpis }: {
  titulo: string; area: AreaCodigo; comp: string; escopo: Escopo; base: string; periodo?: Periodo; kpis: Resultado[]
}) {
  return (
    <>
      <Cabecalho titulo={titulo} subtitulo={competenciaLonga(comp)}
        acoes={periodo && <Etiqueta tom={periodo.status === 'APROVADO' || periodo.status === 'FECHADO' ? 'ok' : 'neutro'}>Fechamento: {ROTULO_STATUS[periodo.status]}</Etiqueta>} />
      <AbasArea area={area} ativo="painel" query={`competencia=${comp}`} />
      <BarraFiltros competencia={comp} escopo={escopo} base={base} />
      <Grade cols={4} className="mb-6">{kpis.map((r) => <KpiCard key={r.codigo} r={r} competencia={comp} compacto />)}</Grade>
    </>
  )
}
