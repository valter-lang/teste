import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Plano de preventivas — inclusão' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaRegistro def={entidade('manut_preventiva_plano')} id="novo" searchParams={searchParams} />
}
