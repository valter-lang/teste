import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Chamados de manutenção externa — inclusão' }

export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaRegistro def={entidade('chamado_externo')} id="novo" searchParams={searchParams} />
}
