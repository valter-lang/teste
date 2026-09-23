import { PaginaLista } from '@/components/form/PaginaLista'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Entregas, trocas e retiradas' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/comodato/movimentos" searchParams={searchParams} />
}
