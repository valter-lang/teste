import { notFound } from 'next/navigation'
import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidadePorSegmento } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Backup e restauração — inclusão' }

export default async function Pagina({ params, searchParams }: { params: Promise<{ ent: string }>; searchParams: SearchParams }) {
  const def = entidadePorSegmento('/ti/continuidade', (await params).ent)
  if (!def?.segmento) notFound()
  return <PaginaRegistro def={def} id="novo" searchParams={searchParams} />
}
