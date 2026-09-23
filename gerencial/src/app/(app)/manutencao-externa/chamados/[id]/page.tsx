import Link from 'next/link'
import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { BotaoLink, Card, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { entidade } from '@/lib/operacao/entidades'
import type { Registro } from '@/lib/operacao/crud'
import { carregarCalendario } from '@/lib/operacao/calendario'
import { horasUteis } from '@/lib/horas-uteis'
import { data, dataHora, numero } from '@/lib/format'
import { q, q1 } from '@/lib/db'
import { ROTULOS_STATUS_TROCA } from '@/lib/validacao/manutencao-externa'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Chamado de manutenção externa' }

async function Extras({ reg, podeEditar }: { reg: Registro; podeEditar: boolean }) {
  const cal = await carregarCalendario(reg.unidade_id as number | null)
  const aberto = reg.aberto_em as Date
  const resposta = reg.primeira_resposta_em as Date | null
  const encerrado = reg.encerrado_em as Date | null
  const hResposta = horasUteis(aberto, resposta ?? new Date(), cal)
  const hSolucao = encerrado ? horasUteis(aberto, encerrado, cal) : null
  const sla = (await q1<{ valor: number | null }>(`select valor from configuracao where chave = 'manut_externa.sla_primeira_resposta_horas_uteis'`))?.valor
  const slaNum = typeof sla === 'number' ? sla : null
  const dentro = slaNum != null ? hResposta <= slaNum : null

  const trocas = await q<{ id: number; data_solicitacao: string; data_troca: string | null; status: string }>(
    `select id, data_solicitacao, data_troca, status from solicitacao_troca where chamado_externo_id = $1 and excluido_em is null order by id`, [reg.id])
  const posteriores = await q<{ id: number; numero: string; aberto_em: Date }>(
    `select id, numero, aberto_em from chamado_externo where chamado_anterior_id = $1 and excluido_em is null order by aberto_em`, [reg.id])

  return (
    <>
      <Card titulo="Tempos em horas úteis (calendário oficial)">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-neutro">Até a 1ª resposta{resposta ? '' : ' (em aberto, até agora)'}</dt>
            <dd className="text-xl font-bold tabular">{numero(hResposta, 1)} h úteis</dd>
            {dentro != null && reg.elegivel_sla !== false && (
              <dd className="mt-1">
                <Etiqueta tom={dentro ? 'ok' : 'critico'}>{dentro ? '✓ Dentro do SLA' : '▲ Fora do SLA'} de {numero(slaNum!, 0)} h úteis</Etiqueta>
              </dd>
            )}
            {reg.elegivel_sla === false && <dd className="mt-1"><Etiqueta>Inelegível ao SLA</Etiqueta></dd>}
          </div>
          <div>
            <dt className="text-xs text-neutro">Até o encerramento</dt>
            <dd className="text-xl font-bold tabular">{hSolucao == null ? 'Não informado' : `${numero(hSolucao, 1)} h úteis`}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutro">Expediente considerado</dt>
            <dd>{cal.inicio}–{cal.fim}, {cal.diasUteis.length} dias/semana, {cal.feriados.size} feriado(s) no calendário</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutro">Abertura {dataHora(aberto)}{resposta ? ` · 1ª resposta ${dataHora(resposta)}` : ''}. Horário de Brasília.</p>
      </Card>

      <Card titulo="Solicitações de troca vinculadas" acoes={podeEditar && !reg.excluido_em
        ? <BotaoLink href={`/manutencao-externa/trocas/novo?chamado=${reg.id}`}>Criar solicitação de troca</BotaoLink> : undefined}>
        {trocas.length === 0 ? <Vazio>Nenhuma solicitação de troca vinculada.</Vazio> : (
          <Tabela legenda="Trocas vinculadas">
            <thead><tr><Th>Solicitação</Th><Th>Data</Th><Th>Troca</Th><Th>Status</Th></tr></thead>
            <tbody>
              {trocas.map((t) => (
                <tr key={t.id}>
                  <Td><Link className="font-semibold text-vinho underline" href={`/manutencao-externa/trocas/${t.id}`}>#{t.id}</Link></Td>
                  <Td>{data(t.data_solicitacao)}</Td><Td>{data(t.data_troca)}</Td>
                  <Td>{ROTULOS_STATUS_TROCA[t.status as 'PENDENTE'] ?? t.status}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <Card titulo="Reincidência">
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Chamado anterior:{' '}
            {reg.chamado_anterior_id
              ? <Link className="font-semibold text-vinho underline" href={`/manutencao-externa/chamados/${reg.chamado_anterior_id}`}>{reg.__vinculos?.chamado_anterior_numero || `#${reg.chamado_anterior_id}`}</Link>
              : 'nenhum (não é reincidência)'}
          </p>
          <p>
            Chamados posteriores que apontam este como anterior:{' '}
            {posteriores.length === 0 ? 'nenhum' : posteriores.map((p, i) => (
              <span key={p.id}>{i > 0 && ', '}<Link className="font-semibold text-vinho underline" href={`/manutencao-externa/chamados/${p.id}`}>{p.numero}</Link></span>
            ))}
          </p>
        </div>
      </Card>
    </>
  )
}

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params
  return <PaginaRegistro def={entidade('chamado_externo')} id={id} searchParams={searchParams}
    extras={(reg, ctx) => <Extras reg={reg} podeEditar={ctx.podeEditar} />} />
}
