import { PaginaLista } from '@/components/form/PaginaLista'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Patches e segurança' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/ti/patches" searchParams={searchParams} />
}
