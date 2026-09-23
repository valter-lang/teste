import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, pode } from '@/lib/auth/permissoes'
import { competenciaSelecionada, paramTexto, type SearchParams } from '@/lib/filtros'
import { competenciaLonga, dataHora } from '@/lib/format'
import { analisesDaCompetencia } from '@/lib/gestao'
import { definicoesVigentes } from '@/lib/indicadores/motor'
import { q } from '@/lib/db'
import { Cabecalho, Card, Etiqueta, Botao } from '@/components/ui'
import { BarraFiltros } from '@/components/BarraFiltros'
import { FormAnalise, FormComentario, TIPOS } from './Formularios'
import { removerAnalise } from './acoes'

export const metadata = { title: 'Análises e destaques' }

export default async function Analises({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('painel.ler')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const filtroArea = paramTexto(sp.area)
  const [itens, defs, comentarios] = await Promise.all([
    analisesDaCompetencia(comp), definicoesVigentes(undefined, { classes: ['ESSENCIAL', 'COMPLEMENTAR', 'OPERACIONAL'] }),
    q<{ area_codigo: string | null; texto: string; criado_em: string; nome: string }>(`select c.area_codigo, c.texto, c.criado_em::text, u.nome from comentario_diretoria c join usuario u on u.id = c.usuario_id where c.competencia = $1 and c.excluido_em is null order by c.criado_em`, [comp]),
  ])
  const areas = AREAS.filter((a) => !filtroArea || a.codigo === filtroArea)
  return (
    <div>
      <Cabecalho titulo="Análises e destaques" subtitulo={`${competenciaLonga(comp)} · até 3 destaques e 3 pontos de atenção por área; cada item com fato, número e responsável.`} />
      <BarraFiltros competencia={comp} base="/analises" />
      <div className="flex flex-col gap-5">
        {areas.map((a) => {
          const doArea = itens.filter((i) => i.area_codigo === a.codigo)
          const edita = pode(u, 'analise.editar', a.codigo)
          return (
            <Card key={a.codigo} id={a.codigo} titulo={a.nome}>
              {doArea.length === 0 ? <p className="mb-3 text-sm text-neutro">Nenhuma análise registrada.</p> : (
                <ul className="mb-4 flex flex-col gap-2">
                  {doArea.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 rounded-md border border-pedra/60 p-3 text-sm">
                      <div>
                        <Etiqueta tom={i.tipo === 'DESTAQUE' ? 'ok' : i.tipo === 'RISCO' || i.tipo === 'ATENCAO' ? 'critico' : 'dourado'}>{TIPOS[i.tipo]}</Etiqueta>{' '}
                        {i.fato} {i.numero && <strong>· {i.numero}</strong>}
                        <p className="mt-1 text-xs text-neutro">Responsável: {i.responsavel}{i.indicador_codigo && ` · Indicador: ${defs.find((d) => d.codigo === i.indicador_codigo)?.nome ?? i.indicador_codigo}`}{i.ocorrencia && ` · Ocorrência: ${i.ocorrencia}`}{i.area_dependente && ` · Depende de: ${AREAS.find((x) => x.codigo === i.area_dependente)?.nome}`}</p>
                      </div>
                      {edita && <form action={removerAnalise}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="area" value={a.codigo} /><Botao variante="fantasma" className="text-xs">Remover</Botao></form>}
                    </li>
                  ))}
                </ul>
              )}
              {edita && <details className="rounded-md bg-creme p-3"><summary className="cursor-pointer text-sm font-semibold text-vinho">Adicionar análise</summary><div className="mt-3">
                <FormAnalise competencia={comp} area={a.codigo} areas={AREAS} indicadores={defs.filter((d) => d.area_codigo === a.codigo).map((d) => ({ codigo: d.codigo, nome: d.nome }))} />
              </div></details>}
              <div className="mt-4 border-t border-pedra/50 pt-3">
                {comentarios.filter((c) => c.area_codigo === a.codigo).map((c, k) => <p key={k} className="mb-2 text-sm"><strong>{c.nome}</strong> <span className="text-xs text-neutro">{dataHora(c.criado_em)}</span><br />{c.texto}</p>)}
                {pode(u, 'painel.comentar') && <FormComentario competencia={comp} area={a.codigo} />}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
