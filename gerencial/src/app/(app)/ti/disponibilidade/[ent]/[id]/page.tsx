import { notFound } from 'next/navigation'
import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidadePorSegmento } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Disponibilidade de sistemas' }

export default async function Pagina({ params, searchParams }: { params: Promise<{ ent: string; id: string }>; searchParams: SearchParams }) {
  const { ent, id } = await params
  const def = entidadePorSegmento('/ti/disponibilidade', ent)
  if (!def?.segmento) notFound()
  return <PaginaRegistro def={def} id={id} searchParams={searchParams} />
}
