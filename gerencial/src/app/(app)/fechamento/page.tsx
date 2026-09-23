import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, pode } from '@/lib/auth/permissoes'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { competenciaLonga, dataHora } from '@/lib/format'
import { acoesPossiveis, checklist, exigenciasIndicadores, historicoPeriodo, periodosDaCompetencia, situacaoConsolidada, ROTULO_STATUS } from '@/lib/fechamento'
import { q } from '@/lib/db'
import { Alerta, BotaoLink, Cabecalho, Card, Etiqueta, Semaforo } from '@/components/ui'
import { BarraFiltros } from '@/components/BarraFiltros'
import { AcoesPeriodo, Declaracao } from './Formularios'

export const metadata = { title: 'Fechamento mensal' }

const FLUXO = ['RASCUNHO', 'EM_PREENCHIMENTO', 'EM_VALIDACAO', 'APROVADO', 'FECHADO'] as const

export default async function Fechamento({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('painel.ler')
  const comp = await competenciaSelecionada((await searchParams).competencia)
  const [periodos, selo, declaracoes] = await Promise.all([
    periodosDaCompetencia(comp), situacaoConsolidada(comp),
    q<{ area_codigo: string; chave: string }>(`select area_codigo, chave from declaracao_periodo where competencia = $1 and valor`, [comp]),
  ])
  const dados = await Promise.all(periodos.map(async (p) => ({
    p, itens: await checklist(p.area, comp), ex: await exigenciasIndicadores(p.area, comp), hist: await historicoPeriodo(p.area, comp),
  })))
  return (
    <div>
      <Cabecalho titulo="Fechamento mensal" subtitulo={`${competenciaLonga(comp)} · Rascunho → Em preenchimento → Em validação → Aprovado → Fechado`} />
      <BarraFiltros competencia={comp} base="/fechamento" />
      <div className="mb-6">
        {selo.oficial ? <Alerta tom="ok" titulo="✓ Todas as áreas obrigatórias aprovadas">Relatórios desta competência recebem o selo “Oficial”.</Alerta>
          : <Alerta tom="atencao" titulo="! Consolidado preliminar">Relatórios recebem o selo “Oficial” somente quando todas as áreas obrigatórias estiverem aprovadas. Pendentes: {selo.pendentes.map((a) => AREAS.find((x) => x.codigo === a)?.nome).join(', ')}.</Alerta>}
      </div>
      <div className="flex flex-col gap-5">
        {dados.map(({ p, itens, ex, hist }) => {
          const area = AREAS.find((a) => a.codigo === p.area)!
          const etapa = FLUXO.indexOf(p.status)
          const bloqueantes = itens.filter((i) => i.severidade === 'BLOQUEANTE')
          return (
            <Card key={p.area} id={p.area} titulo={area.nome}
              acoes={<Etiqueta tom={etapa >= 3 ? 'ok' : etapa === 2 ? 'dourado' : 'neutro'}>{ROTULO_STATUS[p.status]}</Etiqueta>}>
              <ol className="mb-4 flex flex-wrap gap-1 text-xs" aria-label="Etapas do fechamento">
                {FLUXO.map((s, i) => (
                  <li key={s} aria-current={i === etapa ? 'step' : undefined}
                    className={`rounded-full px-2.5 py-1 font-semibold ${i < etapa ? 'bg-ok-fundo text-ok' : i === etapa ? 'bg-vinho text-branco' : 'bg-neutro-fundo text-neutro'}`}>
                    {i < etapa ? '✓ ' : ''}{ROTULO_STATUS[s]}
                  </li>
                ))}
              </ol>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold">Checklist da competência</h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {itens.length === 0 && <li className="text-ok">✓ Nenhum registro pendente ou inconsistente encontrado.</li>}
                    {itens.map((i) => (
                      <li key={i.chave} className="flex items-start justify-between gap-2">
                        <span>{i.severidade === 'BLOQUEANTE' ? <Etiqueta tom="critico">▲ Bloqueante</Etiqueta> : <Etiqueta tom="atencao">! Alerta</Etiqueta>} {i.descricao}: <strong>{i.quantidade}</strong></span>
                        {i.link && <Link className="shrink-0 text-xs font-semibold text-vinho" href={`${i.link}?competencia=${comp}`}>Revisar →</Link>}
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-4 mb-2 text-sm font-bold">Indicadores e comentários obrigatórios</h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {ex.vermelhosSemPlano.map((r) => <li key={`p${r.codigo}`}><Semaforo status="VERMELHO" /> {r.nome}: <strong>sem plano de ação</strong> <Link className="text-xs font-semibold text-vinho" href={`/planos-acao/novo?area=${p.area}&indicador=${r.codigo}&competencia=${comp}`}>Criar plano →</Link></li>)}
                    {ex.vermelhosSemExplicacao.map((r) => <li key={`e${r.codigo}`}><Semaforo status="VERMELHO" /> {r.nome}: <strong>sem explicação do desvio</strong> <Link className="text-xs font-semibold text-vinho" href={`/analises?competencia=${comp}&area=${p.area}`}>Registrar →</Link></li>)}
                    {ex.amarelosSemExplicacao.map((r) => <li key={`a${r.codigo}`}><Semaforo status="AMARELO" /> {r.nome}: explicação recomendada</li>)}
                    {!ex.vermelhosSemPlano.length && !ex.vermelhosSemExplicacao.length && !ex.amarelosSemExplicacao.length && <li className="text-ok">✓ Sem exigências pendentes de indicadores.</li>}
                  </ul>
                  {p.area === 'TI' && pode(u, 'periodo.enviar_validacao', 'TI') && etapa < 2 && (
                    <div className="mt-4 flex flex-col gap-2 rounded-md bg-creme p-3">
                      <p className="text-xs text-neutro">Ausência de registro não é zero: confirme explicitamente quando não houve ocorrência.</p>
                      {[['SEM_P1', 'Declarar: não houve incidente P1'], ['SEM_INCIDENTE_SEGURANCA', 'Declarar: não houve incidente de segurança'], ['SEM_TESTE_RESTAURACAO', 'Declarar: não houve teste de restauração']].map(([ch, r]) =>
                        declaracoes.some((d) => d.area_codigo === 'TI' && d.chave === ch) ? <p key={ch} className="text-sm text-ok">✓ {r.replace('Declarar: ', 'Declarado: ')}</p>
                          : <Declaracao key={ch} area="TI" competencia={comp} chave={ch} rotulo={r} />)}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold">Ações</h3>
                  {bloqueantes.length > 0 && p.status !== 'APROVADO' && p.status !== 'FECHADO' && <p className="mb-2 text-xs text-critico">Resolva as pendências bloqueantes antes de enviar para aprovação.</p>}
                  <AcoesPeriodo area={p.area} competencia={comp} versao={p.versao} acoes={acoesPossiveis(u, p.area, p.status)} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <BotaoLink href={`${area.rota}?competencia=${comp}`}>Painel da área</BotaoLink>
                    <BotaoLink href={`/analises?competencia=${comp}&area=${p.area}`}>Análises e destaques</BotaoLink>
                  </div>
                  <h3 className="mt-4 mb-2 text-sm font-bold">Histórico</h3>
                  {hist.length === 0 ? <p className="text-xs text-neutro">Sem movimentações.</p> : (
                    <ul className="flex flex-col gap-1 text-xs">
                      {hist.map((h, i) => (
                        <li key={i}><strong>{dataHora(h.em)}</strong> — {h.nome ?? 'Sistema'}: {h.de_status ? ROTULO_STATUS[h.de_status as keyof typeof ROTULO_STATUS] : '—'} → {ROTULO_STATUS[h.para_status as keyof typeof ROTULO_STATUS]}{h.justificativa && <> · <em>“{h.justificativa}”</em></>}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
