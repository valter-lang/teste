import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Incidentes críticos — inclusão' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaRegistro def={entidade('ti_incidente_critico')} id="novo" searchParams={searchParams} />
}
