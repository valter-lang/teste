import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Movimentações de estoque — inclusão' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaRegistro def={entidade('movimento_estoque')} id="novo" searchParams={searchParams} />
}
