import { PaginaLista } from '@/components/form/PaginaLista'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Projetos e entregas' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/ti/projetos" titulo="Projetos e entregas" searchParams={searchParams} />
}
