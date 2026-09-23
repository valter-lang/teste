import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirLogin } from '@/lib/auth/sessao'
import { AcessoNegado, pode } from '@/lib/auth/permissoes'
import { competenciaCurta, dataHora, numero } from '@/lib/format'
import { listarPendencias, obterImportacao } from '@/lib/importacao/consultas'
import { PENDENCIAS_BLOQUEANTES } from '@/lib/importacao/gravar'
import { Alerta, AreaTexto, Botao, BotaoLink, Cabecalho, Campo, Card, Entrada, Etiqueta, Grade, Tabela, Td, Th, Vazio } from '@/components/ui'
import { descartar, gravar, homologar, resolver } from '../acoes'
import { ROTULO_PENDENCIA, ROTULO_STATUS } from '../rotulos'

export const metadata = { title: 'Importação da planilha' }

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : numero(v, Number.isInteger(v) ? 0 : 2))

function Situacao({ confere }: { confere: boolean }) {
  return <span className="whitespace-nowrap">{confere ? <Etiqueta tom="ok">✓ Confere</Etiqueta> : <Etiqueta tom="critico">▲ Diverge</Etiqueta>}</span>
}

export default async function PaginaImportacaoDetalhe({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; ok?: string; tipo?: string; rec?: string }>
}) {
  const u = await exigirLogin()
  if (!pode(u, 'importacao.executar') && !pode(u, 'importacao.homologar')) throw new AcessoNegado()
  const { id: idTxt } = await params
  const sp = await searchParams
  const id = Number(idTxt)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const imp = await obterImportacao(id)
  if (!imp) notFound()
  const tipo = sp.tipo && ROTULO_PENDENCIA[sp.tipo] ? sp.tipo : undefined
  const pendencias = await listarPendencias(id, tipo)
  const r = imp.resumo
  const podeExecutar = pode(u, 'importacao.executar')
  const podeHomologar = pode(u, 'importacao.homologar')
  const editavel = imp.status === 'ANALISADA' || imp.status === 'GRAVADA'
  const rec = imp.reconciliacao ?? []
  const recDiv = rec.filter((x) => !x.confere)
  const totaisDiv = r?.totaisConferidos.filter((t) => !t.confere) ?? []
  const bloqueantes = (await listarPendencias(id)).filter((p) => (PENDENCIAS_BLOQUEANTES as readonly string[]).includes(p.tipo) && (!p.resolvida || !p.resolucao?.trim()))
  const base = `/importacao/${id}`

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho
        titulo={`Importação #${imp.id}`}
        subtitulo={<>{imp.arquivo_nome} · sha256 {imp.arquivo_sha256.slice(0, 12)}… · analisada em {dataHora(imp.criado_em)} por {imp.criado_por_nome ?? '—'}</>}
        acoes={<><Etiqueta tom={ROTULO_STATUS[imp.status].tom}>{ROTULO_STATUS[imp.status].texto}</Etiqueta><BotaoLink href="/importacao">Voltar</BotaoLink></>}
      />
      {sp.erro && <Alerta tom="critico" titulo="Não foi possível concluir">{sp.erro}</Alerta>}
      {sp.ok && <Alerta tom="ok">{sp.ok}</Alerta>}
      {imp.gravado_em && <p className="text-sm text-neutro">Gravada em {dataHora(imp.gravado_em)} por {imp.gravado_por_nome ?? '—'}.</p>}
      {imp.homologado_em && <Alerta tom="ok" titulo={`Homologada em ${dataHora(imp.homologado_em)} por ${imp.homologado_por_nome ?? '—'}`}>{imp.observacao_homologacao}</Alerta>}
      {r?.descarte && <Alerta tom="atencao" titulo="Importação descartada">Status anterior: {r.descarte.status_anterior}. {r.descarte.motivo ? `Motivo: ${r.descarte.motivo}` : ''}</Alerta>}

      {r && (
        <Grade cols={4}>
          <Card titulo="Séries mensais"><p className="text-2xl font-extrabold">{numero(Object.values(r.series).reduce((s, x) => s + x.linhas, 0))}</p><p className="text-sm text-neutro">linhas em {Object.keys(r.series).length} séries</p></Card>
          <Card titulo="Registros detalhados"><p className="text-2xl font-extrabold">{numero(Object.values(r.detalhes).reduce((s, x) => s + x, 0) + r.trocas + r.posicoesComodato)}</p><p className="text-sm text-neutro">{r.trocas} trocas · {r.posicoesComodato} posições de comodato · {Object.entries(r.detalhes).map(([k, v]) => `${v} ${k === 'DESNECESSARIO' ? 'desnecessários' : 'equip. do cliente'}`).join(' · ')}</p></Card>
          <Card titulo="Chamados de TI"><p className="text-2xl font-extrabold">{numero(r.chamadosTi.total)}</p><p className="text-sm text-neutro">TI {r.chamadosTi.ti} · Linear {r.chamadosTi.linear} · teste {r.chamadosTi.teste}</p></Card>
          <Card titulo="Totais conferidos"><p className="text-2xl font-extrabold">{numero(r.totaisConferidos.length - totaisDiv.length)} / {numero(r.totaisConferidos.length)}</p><p className="text-sm text-neutro">{totaisDiv.length ? `${totaisDiv.length} divergente(s)` : 'todos conferem'}</p></Card>
        </Grade>
      )}

      {r && (
        <Card titulo="Análise por aba">
          <Tabela legenda="Blocos reconhecidos por aba">
            <thead><tr><Th>Aba</Th><Th>Bloco</Th><Th>Destino</Th><Th>Faixa</Th><Th alinhar="direita">Registros</Th></tr></thead>
            <tbody>
              {r.abas.flatMap((a) => a.blocos.map((b, k) => (
                <tr key={`${a.aba}-${k}`}>
                  <Td>{k === 0 ? a.aba : ''}</Td><Td>{b.titulo}</Td><Td className="font-mono text-xs">{b.destino}</Td><Td className="font-mono text-xs">{b.faixa}</Td><Td alinhar="direita">{numero(b.registros)}</Td>
                </tr>
              )))}
            </tbody>
          </Tabela>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-vinho">Linhas e soma por série</summary>
            <Tabela className="mt-2" legenda="Linhas por série">
              <thead><tr><Th>Série</Th><Th alinhar="direita">Linhas</Th><Th alinhar="direita">Soma</Th></tr></thead>
              <tbody>{Object.entries(r.series).sort(([a], [b]) => a.localeCompare(b)).map(([s, v]) => <tr key={s}><Td className="font-mono text-xs">{s}</Td><Td alinhar="direita">{numero(v.linhas)}</Td><Td alinhar="direita">{fmt(v.soma)}</Td></tr>)}</tbody>
            </Tabela>
          </details>
        </Card>
      )}

      {imp.status === 'ANALISADA' && podeExecutar && r && (
        <Card titulo="Mapeamento de famílias e gravação">
          <form action={gravar} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={imp.id} />
            {r.propostasMapeamento.length === 0 ? (
              <Vazio>Todos os textos de família foram reconhecidos pelo cadastro.</Vazio>
            ) : (
              <Tabela legenda="Propostas de mapeamento">
                <thead><tr><Th>Aceitar</Th><Th>Texto da planilha</Th><Th>Proposta</Th><Th>Motivo</Th><Th alinhar="direita">Ocorrências</Th></tr></thead>
                <tbody>
                  {r.propostasMapeamento.map((p) => (
                    <tr key={p.chave}>
                      <Td alinhar="centro">
                        {p.acao === 'MANUAL'
                          ? <span className="text-xs text-neutro">Decisão manual</span>
                          : <input type="checkbox" name="proposta" value={p.chave} defaultChecked aria-label={`Aceitar proposta para ${p.textoOriginal}`} className="h-4 w-4" />}
                      </Td>
                      <Td className="font-mono text-xs">{p.textoOriginal}</Td>
                      <Td>{p.acao === 'ALIAS' ? <>Usar <strong>{p.sugestao}</strong>{p.criarAlias ? ' (cria sinônimo)' : ''}</> : p.acao === 'NOVA_FAMILIA' ? <>Criar família <strong>{p.chave}</strong></> : 'Família fica em branco'}</Td>
                      <Td className="text-xs">{p.motivo}</Td>
                      <Td alinhar="direita">{p.ocorrencias.length}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
            <p className="text-sm text-neutro">Propostas não aceitas deixam a família em branco (o texto original é preservado) e a pendência continua aberta.</p>
            <div><Botao type="submit">Gravar importação</Botao></div>
          </form>
        </Card>
      )}
      {imp.status !== 'ANALISADA' && r?.gravacao && (
        <Card titulo="Mapeamentos aplicados na gravação">
          <p className="text-sm">{r.gravacao.propostasAceitas.length ? r.gravacao.propostasAceitas.join(' · ') : 'Nenhuma proposta aceita.'}</p>
          {r.gravacao.naoGravados > 0 && <p className="mt-2 text-sm text-atencao">{r.gravacao.naoGravados} registro(s) já existentes no sistema não foram gravados (ver pendências de duplicidade).</p>}
        </Card>
      )}

      {rec.length > 0 && (
        <Card titulo="Reconciliação planilha x sistema" acoes={recDiv.length ? <Etiqueta tom="critico">▲ {recDiv.length} divergência(s)</Etiqueta> : <Etiqueta tom="ok">✓ {rec.length} verificações conferem</Etiqueta>}>
          <Tabela legenda="Reconciliação por aba, série e competência">
            <thead><tr><Th>Aba</Th><Th>Série</Th><Th>Competência</Th><Th>Célula</Th><Th alinhar="direita">Planilha</Th><Th alinhar="direita">Sistema</Th><Th alinhar="direita">Diferença</Th><Th>Situação</Th></tr></thead>
            <tbody>
              {(sp.rec === 'todas' ? rec : recDiv).map((x, k) => (
                <tr key={k} className={x.confere ? undefined : 'bg-critico-fundo/40'}>
                  <Td>{x.aba}</Td><Td className="font-mono text-xs">{x.serie}</Td><Td>{x.competencia ? competenciaCurta(x.competencia) : '—'}</Td><Td className="font-mono text-xs">{x.celula ?? '—'}</Td>
                  <Td alinhar="direita">{fmt(x.planilha)}</Td><Td alinhar="direita">{fmt(x.sistema)}</Td><Td alinhar="direita">{fmt(x.diferenca)}</Td><Td><Situacao confere={x.confere} /></Td>
                </tr>
              ))}
              {sp.rec !== 'todas' && recDiv.length === 0 && <tr><Td colSpan={8}>Nenhuma divergência.</Td></tr>}
            </tbody>
          </Tabela>
          <p className="mt-2 text-sm">
            {sp.rec === 'todas'
              ? <Link className="font-semibold text-vinho underline" href={base}>Mostrar somente divergências</Link>
              : <Link className="font-semibold text-vinho underline" href={`${base}?rec=todas`}>Mostrar todas as {rec.length} verificações</Link>}
          </p>
        </Card>
      )}

      {totaisDiv.length > 0 && (
        <Card titulo="Totais e médias da planilha que não conferem com o recálculo">
          <Tabela legenda="Totais divergentes">
            <thead><tr><Th>Aba</Th><Th>Célula</Th><Th>Descrição</Th><Th alinhar="direita">Planilha</Th><Th alinhar="direita">Recalculado</Th><Th>Situação</Th></tr></thead>
            <tbody>
              {totaisDiv.map((t, k) => (
                <tr key={k}><Td>{t.aba}</Td><Td className="font-mono text-xs">{t.celula}</Td><Td>{t.descricao}</Td><Td alinhar="direita">{fmt(t.valorPlanilha)}</Td><Td alinhar="direita">{fmt(t.valorCalculado)}</Td><Td><Situacao confere={false} /></Td></tr>
              ))}
            </tbody>
          </Tabela>
        </Card>
      )}

      <Card titulo="Pendências" id="pendencias">
        {r && (
          <nav aria-label="Filtrar pendências por tipo" className="mb-3 flex flex-wrap gap-2 text-sm">
            <Link href={`${base}#pendencias`} aria-current={!tipo ? 'page' : undefined} className={!tipo ? 'font-bold text-vinho underline' : 'text-vinho'}>Todas</Link>
            {Object.entries(r.pendencias).map(([t, n]) => (
              <Link key={t} href={`${base}?tipo=${t}#pendencias`} aria-current={tipo === t ? 'page' : undefined} className={tipo === t ? 'font-bold text-vinho underline' : 'text-vinho'}>
                {ROTULO_PENDENCIA[t] ?? t} ({n})
              </Link>
            ))}
          </nav>
        )}
        {pendencias.length === 0 ? <Vazio>Nenhuma pendência.</Vazio> : (
          <Tabela legenda="Pendências da importação">
            <thead><tr><Th>Tipo</Th><Th>Aba</Th><Th>Célula</Th><Th>Descrição</Th><Th>Situação / resolução</Th></tr></thead>
            <tbody>
              {pendencias.map((p) => (
                <tr key={p.id}>
                  <Td><Etiqueta tom={(PENDENCIAS_BLOQUEANTES as readonly string[]).includes(p.tipo) ? 'critico' : p.tipo === 'INFORMATIVO' ? 'neutro' : 'atencao'}>{ROTULO_PENDENCIA[p.tipo] ?? p.tipo}</Etiqueta></Td>
                  <Td>{p.aba}</Td>
                  <Td className="font-mono text-xs">{p.celula ?? '—'}</Td>
                  <Td className="max-w-xl">{p.descricao}</Td>
                  <Td className="min-w-64">
                    {p.resolvida ? (
                      <span className="text-sm"><Etiqueta tom="ok">✓ Resolvida</Etiqueta> {p.resolucao}{p.resolvido_por_nome ? ` — ${p.resolvido_por_nome}` : ''}</span>
                    ) : editavel && podeExecutar ? (
                      <form action={resolver} className="flex flex-col gap-2">
                        <input type="hidden" name="id" value={imp.id} />
                        <input type="hidden" name="pendencia" value={p.id} />
                        <Entrada name="resolucao" required aria-label={`Resolução da pendência ${p.id}`} placeholder="Como foi resolvida" />
                        <div><Botao type="submit" variante="secundario">Resolver</Botao></div>
                      </form>
                    ) : <Etiqueta tom="atencao">! Aberta</Etiqueta>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      {(editavel || imp.status === 'HOMOLOGADA') && (
        <Grade cols={2}>
          {imp.status === 'GRAVADA' && podeHomologar && (
            <Card titulo="Homologar">
              {bloqueantes.length > 0 && (
                <div className="mb-3"><Alerta tom="atencao" titulo="Homologação bloqueada">{bloqueantes.length} pendência(s) de total incompatível ou conciliação sem resolução registrada.</Alerta></div>
              )}
              <form action={homologar} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={imp.id} />
                <Campo rotulo="Observação da homologação" nome="observacao" obrigatorio>
                  <AreaTexto id="observacao" name="observacao" required />
                </Campo>
                <div><Botao type="submit" disabled={bloqueantes.length > 0}>Homologar importação</Botao></div>
              </form>
            </Card>
          )}
          {podeExecutar && (
            <Card titulo="Descartar">
              <form action={descartar} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={imp.id} />
                <p className="text-sm text-neutro">
                  {imp.status === 'ANALISADA' ? 'Nada foi gravado: o descarte apenas encerra esta análise.' : 'Remove todos os registros gravados por esta importação (séries, detalhes, trocas, posições de comodato e chamados de TI).'}
                </p>
                <Campo rotulo="Motivo" nome="motivo" obrigatorio={imp.status !== 'ANALISADA'}>
                  <Entrada id="motivo" name="motivo" required={imp.status !== 'ANALISADA'} />
                </Campo>
                <div><Botao type="submit" variante="perigo">Descartar importação</Botao></div>
              </form>
            </Card>
          )}
        </Grade>
      )}
    </div>
  )
}
