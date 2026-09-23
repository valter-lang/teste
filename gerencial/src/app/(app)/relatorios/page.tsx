import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { competenciaSelecionada, paramTexto, type SearchParams } from '@/lib/filtros'
import { competenciaAtual, somarMeses } from '@/lib/competencia'
import { competenciaLonga, dataHora, competenciaCurta } from '@/lib/format'
import { q } from '@/lib/db'
import { listarJobs } from '@/lib/relatorios/fila'
import { ROTULO_ESCOPO, ROTULO_FORMATO, ROTULO_MODO } from '@/lib/relatorios/nomes'
import { Alerta, Botao, Cabecalho, Campo, Card, Etiqueta, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { solicitarRelatorioAcao } from './acoes'
import { StatusJob } from './StatusJob'

export const metadata = { title: 'Central de relatórios' }

export default async function PaginaRelatorios({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirLogin()
  const sp = await searchParams
  if (!pode(u, 'relatorio.gerar')) {
    return (
      <div className="max-w-2xl">
        <Cabecalho titulo="Central de relatórios" />
        <Alerta tom="critico" titulo="Acesso negado">Seu perfil não pode gerar relatórios.</Alerta>
      </div>
    )
  }
  const competencia = await competenciaSelecionada(sp.competencia)
  const erro = paramTexto(sp.erro)
  const solicitado = paramTexto(sp.solicitado)
  const atual = competenciaAtual()
  const opcoes = Array.from({ length: 24 }, (_, i) => somarMeses(atual, -i))
  if (!opcoes.includes(competencia)) opcoes.push(competencia)
  const unidades = await q<{ id: number; nome: string }>(`select id, nome from unidade where ativo order by nome`)
  const jobs = await listarJobs(u)

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho
        titulo="Central de relatórios"
        subtitulo="Exportações oficiais em Excel, PDF e PowerPoint geradas a partir do mesmo motor de indicadores dos painéis."
      />
      {erro && <Alerta tom="critico" titulo="Não foi possível solicitar">{erro}</Alerta>}
      {solicitado && !erro && (
        <Alerta tom="ok" titulo="Relatório solicitado">
          A geração continua em segundo plano; acompanhe o andamento no histórico abaixo. Você pode continuar usando o sistema.
        </Alerta>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold">Apresentação da Diretoria — {competenciaLonga(competencia)}</h2>
            <p className="text-sm text-neutro">PowerPoint editável (gráficos e tabelas nativos), consolidado, modo executivo.</p>
          </div>
          <form action={solicitarRelatorioAcao}>
            <input type="hidden" name="competencia" value={competencia} />
            <input type="hidden" name="formato" value="PPTX" />
            <input type="hidden" name="escopo" value="CONSOLIDADO" />
            <input type="hidden" name="modo" value="EXECUTIVO" />
            <Botao variante="destaque" className="px-5 py-3 text-base">Gerar apresentação da Diretoria</Botao>
          </form>
        </div>
      </Card>

      <Card titulo="Outras opções">
        <form action={solicitarRelatorioAcao} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Campo rotulo="Competência" nome="competencia" obrigatorio>
            <Selecao id="competencia" name="competencia" defaultValue={competencia}>
              {opcoes.map((c) => <option key={c} value={c}>{competenciaLonga(c)}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Escopo" nome="escopo">
            <Selecao id="escopo" name="escopo" defaultValue="CONSOLIDADO">
              {Object.entries(ROTULO_ESCOPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Modo" nome="modo" ajuda="Completo inclui indicadores complementares, operacionais e apêndices.">
            <Selecao id="modo" name="modo" defaultValue="EXECUTIVO">
              {Object.entries(ROTULO_MODO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Formato" nome="formato">
            <Selecao id="formato" name="formato" defaultValue="PDF_A4">
              {Object.entries(ROTULO_FORMATO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Unidades" nome="unidades" ajuda="Nenhuma marcada = todas. Aplica-se às linhas de origem.">
            <div className="flex flex-col gap-1 rounded-md border border-pedra bg-branco px-3 py-2 text-sm">
              {unidades.map((un) => (
                <label key={un.id} className="flex items-center gap-2"><input type="checkbox" name="unidades" value={un.id} /> {un.nome}</label>
              ))}
            </div>
          </Campo>
          <div className="md:col-span-2 xl:col-span-5">
            <Botao variante="primario">Solicitar relatório</Botao>
          </div>
        </form>
      </Card>

      <Card titulo="Histórico de relatórios">
        {jobs.length === 0 ? (
          <Vazio>Nenhum relatório solicitado ainda.</Vazio>
        ) : (
          <Tabela legenda="Histórico de relatórios solicitados">
            <thead>
              <tr>
                <Th>Formato</Th><Th>Escopo</Th><Th>Modo</Th><Th>Competência</Th><Th alinhar="centro">Versão</Th>
                <Th>Selo</Th><Th>Situação</Th><Th>Solicitado por / em</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className={String(j.id) === solicitado ? 'bg-creme' : undefined}>
                  <Td>{ROTULO_FORMATO[j.formato]}</Td>
                  <Td>{ROTULO_ESCOPO[j.escopo]}</Td>
                  <Td>{ROTULO_MODO[j.modo]}</Td>
                  <Td>{competenciaCurta(j.competencia)}</Td>
                  <Td alinhar="centro">{j.versao ? `v${String(j.versao).padStart(2, '0')}` : '—'}</Td>
                  <Td>
                    {j.situacao_fechamento === 'OFICIAL' ? <span className="whitespace-nowrap"><Etiqueta tom="ok">✓&nbsp;Oficial</Etiqueta></span>
                      : j.situacao_fechamento === 'PRELIMINAR' ? <span className="whitespace-nowrap"><Etiqueta tom="atencao">!&nbsp;Preliminar</Etiqueta></span> : '—'}
                  </Td>
                  <Td>
                    <StatusJob inicial={{ id: j.id, status: j.status, progresso: j.progresso, etapa: j.etapa, mensagem_erro: j.mensagem_erro,
                      arquivo_id: j.arquivo_id, arquivo_nome: j.arquivo_nome, versao: j.versao, situacao_fechamento: j.situacao_fechamento }} />
                  </Td>
                  <Td>{j.solicitado_por_nome}<div className="text-xs text-neutro">{dataHora(j.solicitado_em)}</div></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <p className="mt-3 text-xs text-neutro">
          O selo “Oficial” exige todas as áreas do escopo com fechamento aprovado; caso contrário o relatório sai “Preliminar”.
          Cada nova geração cria uma versão sequencial por formato, escopo, modo e competência.
        </p>
      </Card>
    </div>
  )
}
