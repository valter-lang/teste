/**
 * Estrutura da apresentação (lista de slides) montada a partir do snapshot. O PowerPoint
 * editável e o PDF 16:9 renderizam exatamente esta mesma lista, com a mesma geometria.
 */
import type { DadosRelatorio, IndicadorRelatorio, Quebra, SecaoId, TabelaExtra } from './tipos'
import { GRUPOS_ISOLADOS, SECOES, tituloSecao } from './nomes'

export type Tom = 'vinho' | 'critico' | 'atencao' | 'ok' | 'neutro' | 'dourado'

export interface ItemLista { texto: string; detalhe?: string }
export interface GrupoLista { titulo: string; tom: Tom; itens: ItemLista[] }

export type Slide =
  | { tipo: 'CAPA' }
  | { tipo: 'CONTEXTO'; titulo: string }
  | { tipo: 'RESUMO'; titulo: string; mensagens: string[]; inicio: number }
  | { tipo: 'SEMAFORO'; titulo: string; indicadores: IndicadorRelatorio[] }
  | { tipo: 'LISTA'; titulo: string; grupos: GrupoLista[] }
  | { tipo: 'INDICADORES'; titulo: string; secao: SecaoId | null; indicadores: IndicadorRelatorio[]; quebra: Quebra | null; comentarios: string[] }
  | { tipo: 'QUEBRA'; titulo: string; quebra: Quebra }
  | { tipo: 'TABELA'; titulo: string; subtitulo?: string; colunas: string[]; larguras: number[]; alinhamento: ('esquerda' | 'direita' | 'centro')[]; linhas: string[][]; tons?: (Tom | null)[]; nota?: string }
  | { tipo: 'APENDICE'; titulo: string; indicador: IndicadorRelatorio }

export interface Deck { slides: Slide[]; apendicePorCodigo: Record<string, number>; slidePorCodigo: Record<string, number> }

/* Geometria comum (polegadas; 1 in = 96 px no PDF 16:9) */
export const G = {
  largura: 13.333,
  altura: 7.5,
  margem: 0.5,
  tituloY: 0.38,
  conteudoY: 1.2,
  rodapeY: 7.02,
  maxCards: 4,
  maxLinhasTabela: 12,
  maxItensLista: 6,
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const ordemStatus: Record<string, number> = { VERMELHO: 0, AMARELO: 1, VERDE: 2, SEM_META: 3, NA: 4 }

function comentariosDe(inds: IndicadorRelatorio[]): string[] {
  const out: string[] = []
  for (const i of inds) for (const c of i.comentarios) out.push(`${i.nome}: ${c.texto}`)
  return out.slice(0, 4)
}

function slidesTabelaExtra(t: TabelaExtra): Slide[] {
  return chunk(t.linhas, G.maxLinhasTabela).map((linhas, k, arr) => ({
    tipo: 'TABELA' as const, titulo: arr.length > 1 ? `${t.titulo} (${k + 1}/${arr.length})` : t.titulo, subtitulo: `Fonte: ${t.fonte}`,
    colunas: t.colunas, larguras: t.colunas.map((_, i) => (i === 0 ? 3 : 1)), alinhamento: t.alinhamento, linhas,
  }))
}

function slidesAnalises(d: DadosRelatorio): Slide[] {
  const grupos: GrupoLista[] = []
  const add = (tipo: string, titulo: string, tom: Tom) => {
    const itens = d.analises.filter((a) => a.tipo === tipo).map((a) => ({
      texto: `${a.fato}${a.numero ? ` (${a.numero})` : ''}`,
      detalhe: [a.areaNome, a.indicadorNome, a.areaDependente ? `depende de: ${a.areaDependente}` : null, `resp.: ${a.responsavel}`].filter(Boolean).join(' • '),
    }))
    if (itens.length) grupos.push({ titulo, tom, itens })
  }
  add('DESTAQUE', 'Destaques', 'ok')
  add('ATENCAO', 'Pontos de atenção', 'atencao')
  add('RISCO', 'Riscos', 'critico')
  add('DEPENDENCIA', 'Dependências', 'dourado')
  // Paginação por quantidade de itens (máx. 6 por slide, dois grupos por coluna)
  const slides: Slide[] = []
  let atual: GrupoLista[] = []
  let n = 0
  for (const g of grupos) {
    for (const parte of chunk(g.itens, G.maxItensLista)) {
      if (n + parte.length > G.maxItensLista * 2 || atual.length >= 4) { slides.push({ tipo: 'LISTA', titulo: 'Destaques, riscos e dependências', grupos: atual }); atual = []; n = 0 }
      atual.push({ ...g, itens: parte })
      n += parte.length
    }
  }
  if (atual.length) slides.push({ tipo: 'LISTA', titulo: 'Destaques, riscos e dependências', grupos: atual })
  return slides
}

function slidesDecisoes(d: DadosRelatorio): Slide[] {
  const itens = d.analises.filter((a) => a.tipo === 'DECISAO_SOLICITADA').map((a) => ({
    texto: `${a.fato}${a.numero ? ` (${a.numero})` : ''}`,
    detalhe: [a.areaNome, a.indicadorNome, `resp.: ${a.responsavel}`].filter(Boolean).join(' • '),
  }))
  return chunk(itens, G.maxItensLista).map((parte, k, arr) => ({
    tipo: 'LISTA' as const, titulo: `Decisões solicitadas à Diretoria${arr.length > 1 ? ` (${k + 1}/${arr.length})` : ''}`,
    grupos: [{ titulo: 'Para deliberação', tom: 'vinho' as Tom, itens: parte }],
  }))
}

function slidesPlanos(d: DadosRelatorio, forcar: boolean): Slide[] {
  const linhas = d.planos.map((p) => [p.codigo, p.indicador, p.acao, p.responsavel, p.prazoTexto, p.vencida ? `▲ Vencida — ${p.statusRotulo}` : p.statusRotulo])
  const tons = d.planos.map((p) => (p.vencida ? 'critico' as Tom : null))
  if (!linhas.length) {
    if (!forcar) return []
    const vermelhos = d.indicadores.filter((i) => i.mes.status === 'VERMELHO')
    return [{
      tipo: 'TABELA', titulo: 'Planos de ação', subtitulo: 'Nenhum plano de ação aberto ou criado para a competência.',
      colunas: ['Indicador fora da meta', 'Realizado', 'Meta', 'Situação'], larguras: [4, 1.4, 1.6, 2.4], alinhamento: ['esquerda', 'direita', 'direita', 'esquerda'],
      linhas: vermelhos.length ? vermelhos.slice(0, G.maxLinhasTabela).map((i) => [i.nome, i.mes.texto, i.mes.metaTexto, 'Plano de ação a registrar'])
        : [['Nenhum indicador fora da meta na competência', '—', '—', 'Sem plano necessário']],
    }]
  }
  return chunk(linhas, 10).map((parte, k, arr) => ({
    tipo: 'TABELA' as const, titulo: `Planos de ação${arr.length > 1 ? ` (${k + 1}/${arr.length})` : ''}`,
    subtitulo: `${d.planos.filter((p) => p.vencida).length} vencido(s) de ${d.planos.length} plano(s) em aberto ou criados na competência.`,
    colunas: ['Código', 'Indicador / ocorrência', 'Ação', 'Responsável', 'Prazo', 'Status'], larguras: [1.1, 2.6, 4.2, 1.8, 1.2, 2], alinhamento: ['esquerda', 'esquerda', 'esquerda', 'esquerda', 'centro', 'esquerda'],
    linhas: parte, tons: tons.slice(k * 10, k * 10 + parte.length),
  }))
}

function slidesMetas(d: DadosRelatorio, forcar: boolean): Slide[] {
  const linhas = d.metas.map((m) => [m.indicador, m.ciclo, m.descricao, m.situacaoRotulo, m.vigencia])
  if (!linhas.length) {
    if (!forcar) return []
    return [{ tipo: 'TABELA', titulo: 'Metas do próximo ciclo', subtitulo: 'Nenhuma meta aprovada ou proposta para o próximo ciclo.',
      colunas: ['Indicador', 'Situação'], larguras: [5, 5], alinhamento: ['esquerda', 'esquerda'],
      linhas: d.indicadores.slice(0, G.maxLinhasTabela).map((i) => [i.nome, 'Meta a definir e homologar']) }]
  }
  const tons = d.metas.map((m) => (m.situacao === 'PROPOSTA' ? 'dourado' as Tom : null))
  return chunk(linhas, G.maxLinhasTabela).map((parte, k, arr) => ({
    tipo: 'TABELA' as const, titulo: `Metas do próximo ciclo${arr.length > 1 ? ` (${k + 1}/${arr.length})` : ''}`,
    subtitulo: 'Metas aprovadas vigentes no próximo mês e propostas aguardando aprovação (marcadas como "proposta").',
    colunas: ['Indicador', 'Ciclo', 'Meta', 'Situação', 'Vigência'], larguras: [3.6, 1.3, 3.4, 2.2, 2], alinhamento: ['esquerda', 'esquerda', 'esquerda', 'esquerda', 'esquerda'],
    linhas: parte, tons: tons.slice(k * G.maxLinhasTabela, k * G.maxLinhasTabela + parte.length),
  }))
}

function slidesResumo(d: DadosRelatorio): Slide[] {
  return chunk(d.mensagens, 3).map((m, k, arr) => ({ tipo: 'RESUMO' as const, titulo: `Resumo executivo${arr.length > 1 ? ` (${k + 1}/${arr.length})` : ''}`, mensagens: m, inicio: k * 3 }))
}

function slidesSemaforo(d: DadosRelatorio): Slide[] {
  const inds = [...d.indicadores].filter((i) => i.classe === 'ESSENCIAL')
  return chunk(inds, 10).map((parte, k, arr) => ({ tipo: 'SEMAFORO' as const, titulo: `Semáforo dos indicadores essenciais${arr.length > 1 ? ` (${k + 1}/${arr.length})` : ''}`, indicadores: parte }))
}

function slidesApendices(d: DadosRelatorio, inds: IndicadorRelatorio[], quebrasExtras: Quebra[]): Slide[] {
  const s: Slide[] = inds.map((i) => ({ tipo: 'APENDICE' as const, titulo: `Apêndice — ${i.nome}`, indicador: i }))
  for (const q of quebrasExtras) s.push({ tipo: 'QUEBRA', titulo: `Apêndice — ${q.titulo}`, quebra: q })
  return s
}

export function montarDeck(d: DadosRelatorio): Deck {
  const slides: Slide[] = [{ tipo: 'CAPA' }]
  const escopo = d.metadados.escopo
  const completo = d.metadados.modo === 'COMPLETO'
  const porCodigo = new Map(d.indicadores.map((i) => [i.codigo, i]))

  if (escopo === 'CONSOLIDADO') {
    slides.push({ tipo: 'CONTEXTO', titulo: 'Período, escopo, versão e regra do semáforo' })
    slides.push(...slidesResumo(d))
    slides.push(...slidesSemaforo(d))
    slides.push(...slidesDecisoes(d))
    for (const sec of SECOES) {
      const inds = d.indicadores.filter((i) => i.secao === sec.id).sort((a, b) => (a.classe === 'ESSENCIAL' ? 0 : 1) - (b.classe === 'ESSENCIAL' ? 0 : 1))
      const partes = chunk(inds, G.maxCards)
      partes.forEach((parte, k) => slides.push({
        tipo: 'INDICADORES', titulo: partes.length > 1 ? `${sec.titulo} (${k + 1}/${partes.length})` : sec.titulo, secao: sec.id,
        indicadores: parte, quebra: null, comentarios: comentariosDe(parte),
      }))
      for (const qb of d.quebras.filter((x) => x.secao === sec.id)) slides.push({ tipo: 'QUEBRA', titulo: qb.titulo, quebra: qb })
      for (const t of d.tabelasExtras.filter((x) => x.secao === sec.id)) slides.push(...slidesTabelaExtra(t))
    }
    slides.push(...slidesAnalises(d))
    slides.push(...slidesPlanos(d, false))
    slides.push(...slidesMetas(d, false))
    if (completo) slides.push(...slidesApendices(d, d.indicadores, []))
  } else {
    // Padrão gerencial isolado: exatamente 10 slides executivos + 1 de metas.
    slides.push({ tipo: 'RESUMO', titulo: 'Resumo executivo e semáforo', mensagens: d.mensagens.slice(0, 3), inicio: 0 })
    const usadas = new Set<string>()
    for (const g of GRUPOS_ISOLADOS[escopo]) {
      const inds = g.codigos.map((c) => porCodigo.get(c)).filter((x): x is IndicadorRelatorio => !!x)
      const qb = g.quebra ? d.quebras.find((x) => x.id === g.quebra) ?? null : null
      if (qb) usadas.add(qb.id)
      slides.push({ tipo: 'INDICADORES', titulo: g.titulo, secao: inds[0]?.secao ?? null, indicadores: inds, quebra: qb, comentarios: comentariosDe(inds) })
    }
    slides.push(riscosEDecisoes(d))
    slides.push(...slidesPlanos(d, true).slice(0, 1))
    slides.push(...slidesMetas(d, true).slice(0, 1))
    if (completo) {
      const noDeck = new Set(GRUPOS_ISOLADOS[escopo].flatMap((g) => g.codigos))
      const inds = [...d.indicadores.filter((i) => noDeck.has(i.codigo)), ...d.indicadores.filter((i) => !noDeck.has(i.codigo))]
      slides.push(...slidesApendices(d, inds, d.quebras.filter((x) => !usadas.has(x.id))))
      // demais planos e metas (quando não couberam) também como apêndices
      slides.push(...slidesPlanos(d, false).slice(1).map((s) => ({ ...s, titulo: `Apêndice — ${(s as { titulo: string }).titulo}` }) as Slide))
      slides.push(...slidesMetas(d, false).slice(1).map((s) => ({ ...s, titulo: `Apêndice — ${(s as { titulo: string }).titulo}` }) as Slide))
    }
  }

  const apendicePorCodigo: Record<string, number> = {}
  const slidePorCodigo: Record<string, number> = {}
  slides.forEach((s, i) => {
    if (s.tipo === 'APENDICE') apendicePorCodigo[s.indicador.codigo] = i + 1
    if (s.tipo === 'INDICADORES') for (const ind of s.indicadores) slidePorCodigo[ind.codigo] ??= i + 1
  })
  return { slides, apendicePorCodigo, slidePorCodigo }
}

/** Slide único de riscos e decisões (decks isolados). Nunca vazio: sem registros, mostra os desvios do mês. */
function riscosEDecisoes(d: DadosRelatorio): Slide {
  const grupos: GrupoLista[] = []
  const it = (tipos: string[]) => d.analises.filter((a) => tipos.includes(a.tipo)).map((a) => ({
    texto: `${a.fato}${a.numero ? ` (${a.numero})` : ''}`, detalhe: [a.areaNome, a.indicadorNome, `resp.: ${a.responsavel}`].filter(Boolean).join(' • '),
  }))
  const dec = it(['DECISAO_SOLICITADA'])
  const ris = it(['RISCO', 'DEPENDENCIA', 'ATENCAO'])
  if (dec.length) grupos.push({ titulo: 'Decisões solicitadas à Diretoria', tom: 'vinho', itens: dec.slice(0, G.maxItensLista) })
  if (ris.length) grupos.push({ titulo: 'Riscos, dependências e atenção', tom: 'critico', itens: ris.slice(0, G.maxItensLista) })
  if (!grupos.length) {
    const desvios = d.indicadores.filter((i) => i.mes.status === 'VERMELHO' || i.mes.status === 'AMARELO')
      .sort((a, b) => ordemStatus[a.mes.status] - ordemStatus[b.mes.status])
    grupos.push({
      titulo: 'Nenhum risco ou decisão registrado na competência', tom: 'neutro',
      itens: desvios.length
        ? desvios.slice(0, G.maxItensLista).map((i) => ({ texto: `${i.nome}: ${i.mes.texto} (meta ${i.mes.metaTexto})`, detalhe: i.mes.statusTexto }))
        : [{ texto: 'Todos os indicadores avaliados estão na meta ou sem meta homologada.', detalhe: 'Sem desvios que exijam deliberação.' }],
    })
  }
  return { tipo: 'LISTA', titulo: 'Riscos e decisões', grupos }
}

export { tituloSecao }
