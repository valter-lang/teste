import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Movimentações de estoque' }

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params
  return <PaginaRegistro def={entidade('movimento_estoque')} id={id} searchParams={searchParams} />
}
