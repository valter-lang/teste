import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, nomeArea, pode } from '@/lib/auth/permissoes'
import { definicoesVigentes } from '@/lib/indicadores/motor'
import { q, q1 } from '@/lib/db'
import { data, dataHora } from '@/lib/format'
import { ROTULO_STATUS_PLANO } from '@/lib/planos'
import { Cabecalho, Card, Etiqueta, Grade } from '@/components/ui'
import { FormPlano } from '../FormPlano'
import { FormAndamento } from './FormAndamento'

export default async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const u = await exigirPermissao('painel.ler')
  const p = await q1<Record<string, string | number | null> & { area_codigo: string; status: string; codigo: string; prazo: string; versao: number }>(
    `select id, codigo, area_codigo, indicador_codigo, competencia_origem::text, ocorrencia, cliente_id, causa_raiz, acao, entregavel, responsavel_nome, inicio::text,
            prazo::text, status, criticidade, resultado_esperado, evidencia, avaliacao_eficacia, eficacia, tipo_encerramento, encerrado_em::text, versao
       from plano_acao where id = $1`, [id])
  if (!p) notFound()
  const andamentos = await q<{ texto: string; status_novo: string | null; em: string; nome: string | null }>(
    `select a.texto, a.status_novo, a.em::text, u.nome from plano_acao_andamento a left join usuario u on u.id = a.usuario_id where a.plano_id = $1 order by a.em desc`, [id])
  const edita = pode(u, 'plano.editar', p.area_codigo) && !['ENCERRADA', 'CANCELADA'].includes(p.status)
  const defs = edita ? await definicoesVigentes(undefined, { area: p.area_codigo }) : []
  const vencido = p.prazo < new Date().toISOString().slice(0, 10) && ['ABERTA', 'EM_ANDAMENTO'].includes(p.status)
  return (
    <div>
      <Cabecalho titulo={`Plano ${p.codigo}`} subtitulo={`${nomeArea(p.area_codigo)} · ${p.indicador_codigo ?? p.ocorrencia}`}
        acoes={<><Etiqueta tom={p.status === 'ENCERRADA' ? 'ok' : 'dourado'}>{ROTULO_STATUS_PLANO[p.status]}</Etiqueta>{vencido && <Etiqueta tom="critico">▲ Vencido em {data(p.prazo)}</Etiqueta>}</>} />
      <Grade cols={2}>
        <Card titulo={edita ? 'Dados do plano' : 'Plano'}>
          {edita ? <FormPlano v={p} areas={AREAS.filter((a) => a.codigo === p.area_codigo)} indicadores={defs.map((d) => ({ codigo: d.codigo, nome: d.nome, area: d.area_codigo }))} /> : (
            <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
              {[['Causa raiz', p.causa_raiz], ['Ação', p.acao], ['Entregável', p.entregavel], ['Responsável', p.responsavel_nome], ['Início', data(String(p.inicio))], ['Prazo', data(p.prazo)],
                ['Resultado esperado', p.resultado_esperado], ['Evidência', p.evidencia], ['Eficácia', p.eficacia ? `${p.eficacia === 'EFICAZ' ? 'Eficaz' : 'Não eficaz'} — ${p.avaliacao_eficacia}` : null],
                ['Encerramento', p.tipo_encerramento === 'META_ATINGIDA' ? 'Indicador voltou à meta' : p.tipo_encerramento === 'APROVACAO_DIRETORIA' ? 'Aprovação formal da Diretoria' : null]]
                .filter(([, v]) => v).map(([k, v]) => <Fragment key={String(k)}><dt className="font-semibold">{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          {!['ENCERRADA', 'CANCELADA'].includes(p.status) && (pode(u, 'plano.editar', p.area_codigo) || pode(u, 'plano.aprovar_encerramento', p.area_codigo)) && (
            <Card titulo="Registrar andamento">
              <FormAndamento id={id} statusAtual={p.status} podeAprovar={pode(u, 'plano.aprovar_encerramento', p.area_codigo)} podeEditar={pode(u, 'plano.editar', p.area_codigo)} />
            </Card>
          )}
          <Card titulo="Histórico de andamento">
            {andamentos.length === 0 ? <p className="text-sm text-neutro">Sem registros.</p> : (
              <ol className="flex flex-col gap-2 text-sm">
                {andamentos.map((a, i) => <li key={i} className="border-l-2 border-dourado pl-3"><p className="text-xs text-neutro">{dataHora(a.em)} · {a.nome}{a.status_novo && ` · → ${ROTULO_STATUS_PLANO[a.status_novo]}`}</p><p>{a.texto}</p></li>)}
              </ol>
            )}
            <p className="mt-3 text-xs text-neutro">Todas as alterações dos campos ficam na trilha de auditoria.</p>
          </Card>
        </div>
      </Grade>
    </div>
  )
}
