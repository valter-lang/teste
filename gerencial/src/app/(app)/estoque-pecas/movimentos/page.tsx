import { PaginaLista } from '@/components/form/PaginaLista'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Movimentações de estoque' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/estoque-pecas/movimentos" searchParams={searchParams} />
}
