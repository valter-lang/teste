import { notFound } from 'next/navigation'
import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidadePorSegmento } from '@/lib/operacao/entidades'
import { paramInteiro, type SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Projetos e entregas — inclusão' }

export default async function Pagina({ params, searchParams }: { params: Promise<{ ent: string }>; searchParams: SearchParams }) {
  const def = entidadePorSegmento('/ti/projetos', (await params).ent)
  if (!def?.segmento) notFound()
  const projeto = paramInteiro((await searchParams).projeto, 0)
  return <PaginaRegistro def={def} id="novo" searchParams={searchParams}
    prefill={def.chave === 'ti_marco' && projeto ? { projeto_id: String(projeto), competencia: '' } : undefined} />
}
