import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Posição mensal do comodato — inclusão' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaRegistro def={entidade('comodato_posicao')} id="novo" searchParams={searchParams} />
}
