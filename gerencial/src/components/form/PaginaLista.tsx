import type { ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode, temPapel } from '@/lib/auth/permissoes'
import { competenciaSelecionada, paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { competenciaAtual, somarMeses } from '@/lib/competencia'
import { competenciaLonga, NAO_INFORMADO } from '@/lib/format'
import { AbasArea } from '@/components/AbasArea'
import { Alerta, BotaoLink, Botao, Cabecalho, Card, Entrada, Etiqueta, Paginacao, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { camposEditaveis, entidadePorSegmento, entidadesDaRota, urlRegistro, type EntidadeDef } from '@/lib/operacao/entidades'
import { listarRegistros, registroParaEntrada, VALOR_NULO, type Registro } from '@/lib/operacao/crud'
import { camposComOpcoes, paraCliente } from '@/lib/operacao/formulario'
import { carregarOpcoes } from '@/lib/operacao/cadastros'
import { exibirValor } from '@/lib/operacao/exibicao'
import { periodoBloqueado, ROTULO_STATUS_PERIODO, statusPeriodo } from '@/lib/operacao/periodo'
import { acaoColar, acaoSalvarLinha } from '@/lib/operacao/acoes'
import type { Entrada as EntradaValores } from '@/lib/operacao/tipos'
import { GradeEditavel } from './GradeEditavel'
import { ColarLinhas } from './ColarLinhas'
import { StatusPeriodo } from './StatusPeriodo'

const POR_PAGINA = 50
type Modo = 'lista' | 'grade' | 'colar'
const MODOS: { id: Modo; rotulo: string }[] = [
  { id: 'lista', rotulo: 'Lista' },
  { id: 'grade', rotulo: 'Edição em grade' },
  { id: 'colar', rotulo: 'Colar linhas' },
]

export function opcoesCompetencia(atual: string): string[] {
  const base = competenciaAtual()
  const lista = Array.from({ length: 38 }, (_, i) => somarMeses(base, 1 - i))
  return lista.includes(atual) ? lista : [atual, ...lista]
}

function qs(p: Record<string, string | undefined>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v)
  const s = u.toString()
  return s ? `?${s}` : ''
}

/**
 * Página de listagem genérica de uma entidade (ou de várias, com ?ent=): filtros na URL,
 * paginação, exportação CSV, edição em grade e "colar linhas".
 */
export async function PaginaLista({ rota, searchParams, titulo, descricao, extras, sugestoesGrade, modoPadrao = 'lista' }: {
  rota: string
  searchParams: SearchParams
  titulo?: string
  descricao?: string
  /** Conteúdo adicional por entidade (chave), exibido acima da lista. */
  extras?: (def: EntidadeDef, competencia: string, bloqueio: string | null) => ReactNode | Promise<ReactNode>
  sugestoesGrade?: (competencia: string) => Promise<EntradaValores[]>
  modoPadrao?: Modo
}) {
  const u = await exigirLogin()
  const sp = await searchParams
  const def = entidadePorSegmento(rota, paramTexto(sp.ent))
  const todas = entidadesDaRota(rota)
  if (!def) return <Alerta tom="critico">Seção inexistente.</Alerta>
  const area = def.area
  if (!pode(u, 'dados.ler', area)) {
    return (
      <>
        <Cabecalho titulo={titulo ?? def.titulo} />
        <Alerta tom="critico">Acesso negado para o seu perfil.</Alerta>
      </>
    )
  }
  const comp = await competenciaSelecionada(sp.competencia)
  const modoParam = paramTexto(sp.modo)
  const modo: Modo = MODOS.some((m) => m.id === modoParam) ? (modoParam as Modo) : modoPadrao
  const texto = paramTexto(sp.q)
  const selecoes: Record<string, string | undefined> = Object.fromEntries(def.filtros.map((f) => [f, paramTexto(sp[f])]))
  const gestor = temPapel(u, 'GESTOR', 'ADMIN')
  const mostrarExcluidos = gestor && def.controle.exclusao !== 'fisica' && sp.excluidos === '1' && modo === 'lista'
  const pagina = paramInteiro(sp.pagina, 1)
  const podeEditar = pode(u, 'dados.editar', area)
  const status = def.semCompetencia ? null : await statusPeriodo(area, comp)
  const bloqueio = !podeEditar
    ? 'Seu perfil permite apenas consulta.'
    : status && periodoBloqueado(status)
      ? `O período ${competenciaLonga(comp)} da área está ${ROTULO_STATUS_PERIODO[status].toLowerCase()}. Para alterar dados, o período precisa ser reaberto com justificativa.`
      : null

  const filtrosAtuais: Record<string, string | undefined> = {
    ent: def.segmento, competencia: def.semCompetencia ? undefined : comp, q: texto, ...selecoes, excluidos: mostrarExcluidos ? '1' : undefined,
  }
  const { linhas, total } = await listarRegistros(def, {
    competencia: def.semCompetencia ? null : comp, texto, selecoes, mostrarExcluidos, pagina, porPagina: POR_PAGINA,
  })
  const base = urlRegistro(def)
  const hrefModo = (m: Modo) => `${rota}${qs({ ...filtrosAtuais, modo: m === modoPadrao ? undefined : m })}`
  const hrefExport = `/api/exportar/${def.chave}${qs({ ...filtrosAtuais, ent: undefined })}`

  // Opções dos filtros
  const camposFiltro = def.filtros.map((f) => def.campos.find((c) => c.nome === f)!).filter(Boolean)
  const opRef = await carregarOpcoes(camposFiltro.filter((c) => c.ref).map((c) => c.ref!))
  const colunas = def.campos.filter((c) => c.lista)

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        titulo={titulo ?? def.titulo}
        subtitulo={descricao ?? def.descricao}
        acoes={
          <>
            {podeEditar && <BotaoLink variante="primario" href={`${base}/novo${qs({ competencia: def.semCompetencia ? undefined : comp })}`}>Incluir {def.singular}</BotaoLink>}
            <a href={hrefExport} className="inline-flex items-center justify-center gap-2 rounded-md border border-pedra bg-branco px-3.5 py-2 text-sm font-semibold text-tinta hover:bg-creme">
              Exportar CSV
            </a>
          </>
        }
      />
      <AbasArea area={area} ativo={def.secao} query={def.semCompetencia ? undefined : `competencia=${comp}`} />

      {todas.length > 1 && (
        <nav aria-label="Cadastros desta seção" className="flex flex-wrap gap-2">
          {todas.map((d) => (
            <Link key={d.chave} href={`${rota}${qs({ ent: d.segmento, competencia: comp })}`} aria-current={d.chave === def.chave ? 'page' : undefined}
              className={clsx('rounded-full border px-3 py-1 text-sm font-semibold',
                d.chave === def.chave ? 'border-vinho bg-vinho text-branco' : 'border-pedra bg-branco text-tinta hover:bg-creme')}>
              {d.titulo}
            </Link>
          ))}
        </nav>
      )}
      {todas.length > 1 && def.descricao && !descricao && <p className="-mt-2 text-sm text-neutro">{def.descricao}</p>}

      {sp.excluido === '1' && <Alerta tom="ok">Registro excluído. O motivo ficou registrado na trilha de auditoria.</Alerta>}
      {status && <StatusPeriodo competencia={comp} status={status} />}

      <form method="get" action={rota} className="flex flex-wrap items-end gap-3 rounded-md border border-pedra/60 bg-branco p-3" role="search" aria-label="Filtros">
        {def.segmento && <input type="hidden" name="ent" value={def.segmento} />}
        {modo !== modoPadrao && <input type="hidden" name="modo" value={modo} />}
        {!def.semCompetencia && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Competência
            <Selecao name="competencia" defaultValue={comp} className="py-1.5">
              {opcoesCompetencia(comp).map((c) => <option key={c} value={c}>{competenciaLonga(c)}</option>)}
            </Selecao>
          </label>
        )}
        {def.busca.length > 0 && (
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
            Buscar
            <Entrada name="q" type="search" defaultValue={texto ?? ''} placeholder="Texto…" className="py-1.5" />
          </label>
        )}
        {camposFiltro.map((c) => {
          const opcoes = c.tipo === 'enum'
            ? (c.opcoes ?? []).map((v) => ({ valor: v, rotulo: c.rotulosOpcoes?.[v] ?? v }))
            : c.ref ? opRef[c.ref] ?? []
              : [{ valor: 'true', rotulo: 'Sim' }, { valor: 'false', rotulo: 'Não' }, ...(c.tipo === 'boolNulo' ? [{ valor: VALOR_NULO, rotulo: NAO_INFORMADO }] : [])]
          return (
            <label key={c.nome} className="flex flex-col gap-1 text-xs font-semibold">
              {c.rotulo}
              <Selecao name={c.nome} defaultValue={selecoes[c.nome] ?? ''} className="max-w-56 py-1.5">
                <option value="">Todos</option>
                {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </Selecao>
            </label>
          )
        })}
        {gestor && def.controle.exclusao !== 'fisica' && modo === 'lista' && (
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" name="excluidos" value="1" defaultChecked={mostrarExcluidos} /> Mostrar excluídos
          </label>
        )}
        <Botao type="submit" variante="secundario" className="py-1.5">Filtrar</Botao>
        <Link href={`${rota}${qs({ ent: def.segmento, competencia: def.semCompetencia ? undefined : comp })}`} className="py-1.5 text-sm font-semibold text-vinho underline">Limpar</Link>
      </form>

      {extras && (await extras(def, comp, bloqueio))}

      <nav aria-label="Modo de edição" className="flex flex-wrap gap-1 border-b border-pedra">
        {MODOS.filter((m) => m.id === 'lista' || podeEditar).map((m) => (
          <Link key={m.id} href={hrefModo(m.id)} aria-current={m.id === modo ? 'page' : undefined}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', m.id === modo ? 'border-vermelho text-vinho' : 'border-transparent text-neutro hover:text-vinho')}>
            {m.rotulo}
          </Link>
        ))}
      </nav>

      {modo === 'lista' && (
        <Card>
          {linhas.length === 0 ? (
            <Vazio>Nenhum registro {def.semCompetencia ? '' : `em ${competenciaLonga(comp)} `}com os filtros atuais.</Vazio>
          ) : (
            <Tabela legenda={def.titulo}>
              <thead>
                <tr>
                  <Th>Registro</Th>
                  {colunas.map((c) => <Th key={c.nome} alinhar={['inteiro', 'decimal', 'moeda'].includes(c.tipo) ? 'direita' : 'esquerda'}>{c.rotulo}</Th>)}
                  {(def.calculadas ?? []).map((c) => <Th key={c.nome} alinhar={['inteiro', 'decimal', 'moeda'].includes(c.tipo) ? 'direita' : 'esquerda'}>{c.rotulo}</Th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <tr key={r.id} className={clsx(r.excluido_em && 'bg-neutro-fundo text-neutro')}>
                    <Td>
                      <Link href={`${base}/${r.id}`} className="font-semibold whitespace-nowrap text-vinho underline">#{r.id}</Link>
                      {r.excluido_em && <span className="ml-2"><Etiqueta tom="critico">Excluído</Etiqueta></span>}
                    </Td>
                    {colunas.map((c) => (
                      <Td key={c.nome} alinhar={['inteiro', 'decimal', 'moeda'].includes(c.tipo) ? 'direita' : 'esquerda'}
                        className={clsx(r[c.nome] == null && 'text-neutro italic', c.tipo === 'textoLongo' && 'max-w-72 truncate')}>
                        {exibirValor(c, r[c.nome], r.__rotulos?.[c.nome])}
                      </Td>
                    ))}
                    {(def.calculadas ?? []).map((c) => (
                      <Td key={c.nome} alinhar={['inteiro', 'decimal', 'moeda'].includes(c.tipo) ? 'direita' : 'esquerda'} className={clsx(r[c.nome] == null && 'text-neutro italic')}>
                        {exibirValor(c, r[c.nome])}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} hrefPara={(p) => `${rota}${qs({ ...filtrosAtuais, modo: modo === modoPadrao ? undefined : modo, pagina: String(p) })}`} />
        </Card>
      )}

      {modo === 'grade' && podeEditar && (
        <Card>
          <GradeEditavel
            chave={def.chave}
            campos={await camposComOpcoes(def.campos.filter((c) => c.grade && !c.oculto), linhas as Registro[])}
            linhas={linhas.map((r) => ({ id: r.id, versao: (r.versao as number) ?? null, valores: registroParaEntrada(def, r), somenteLeitura: def.somenteLeitura?.(r) ?? null }))}
            novas={sugestoesGrade ? await sugestoesGrade(comp) : []}
            padrao={{ ...def.padroes, ...(def.semCompetencia ? {} : { competencia: comp.slice(0, 7) }) }}
            acao={acaoSalvarLinha}
            bloqueio={bloqueio}
            calculo={def.calculoGrade}
            urlRegistro={base}
            legenda={`${def.titulo} — edição em grade`}
          />
          <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} hrefPara={(p) => `${rota}${qs({ ...filtrosAtuais, modo: 'grade', pagina: String(p) })}`} />
        </Card>
      )}

      {modo === 'colar' && podeEditar && (
        <Card titulo="Colar linhas do Excel">
          <ColarLinhas
            chave={def.chave}
            campos={camposEditaveis(def, false).map((c) => paraCliente(c, {}))}
            competenciaPadrao={comp}
            acao={acaoColar}
            bloqueio={bloqueio}
            urlRegistro={base}
          />
        </Card>
      )}
    </div>
  )
}
