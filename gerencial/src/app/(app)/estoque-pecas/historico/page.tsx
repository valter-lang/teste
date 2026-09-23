import { PaginaHistorico } from '@/components/form/PaginaHistorico'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Histórico migrado' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaHistorico area="ESTOQUE_PECAS" searchParams={searchParams} />
}
