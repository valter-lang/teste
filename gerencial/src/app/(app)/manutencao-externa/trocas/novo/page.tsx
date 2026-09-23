import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { entidade } from '@/lib/operacao/entidades'
import { paramInteiro, type SearchParams } from '@/lib/filtros'
import { q1 } from '@/lib/db'
import { hojeLocal } from '@/lib/validacao/comum'
import type { Entrada } from '@/lib/operacao/tipos'

export const metadata = { title: 'Trocas de equipamento — inclusão' }

/** Com ?chamado=ID, pré-preenche a solicitação a partir do chamado externo. */
export default async function Pagina({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const chamadoId = paramInteiro(sp.chamado, 0)
  let prefill: Entrada | undefined
  if (chamadoId) {
    const c = await q1<{ numero: string; cliente_id: number | null; familia_id: number | null; tecnico_id: number | null; causa: string | null; identificador: string | null }>(
      'select numero, cliente_id, familia_id, tecnico_id, causa, identificador from chamado_externo where id = $1 and excluido_em is null', [chamadoId])
    if (c) {
      const hoje = hojeLocal()
      prefill = {
        chamado_numero: c.numero, cliente_id: c.cliente_id ? String(c.cliente_id) : '', familia_id: c.familia_id ? String(c.familia_id) : '',
        solicitado_por_tecnico_id: c.tecnico_id ? String(c.tecnico_id) : '', causa: c.causa ?? '', equipamento_texto: c.identificador ?? '',
        data_solicitacao: hoje, competencia: hoje.slice(0, 7),
      }
    }
  }
  return <PaginaRegistro def={entidade('solicitacao_troca')} id="novo" searchParams={searchParams} prefill={prefill} />
}
