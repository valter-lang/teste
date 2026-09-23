import { PaginaLista } from '@/components/form/PaginaLista'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Base ativa e consumo' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/comodato/base" titulo="Base ativa e consumo" searchParams={searchParams} />
}
