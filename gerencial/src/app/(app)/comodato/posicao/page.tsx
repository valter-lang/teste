import { PaginaLista } from '@/components/form/PaginaLista'
import { sugestoesPosicao } from '@/lib/operacao/comodato'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Posição mensal do comodato' }

/** Grade mensal por produto com conciliação ao vivo; produtos do mês anterior vêm pré-preenchidos. */
export default function Pagina({ searchParams }: { searchParams: SearchParams }) {
  return <PaginaLista rota="/comodato/posicao" searchParams={searchParams} modoPadrao="grade" sugestoesGrade={sugestoesPosicao} />
}
