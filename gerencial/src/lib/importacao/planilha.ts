/**
 * Analisador (puro, sem banco) da planilha histórica "Dashboard Executivo
 * Manutenção, Comodato e T.I.". Produz linhas prontas para gravação, propostas
 * de mapeamento, pendências e a conferência de todos os totais/médias.
 *
 * Regras centrais:
 *  - célula vazia = não informado (nenhuma linha é criada); zero explícito = 0;
 *  - fórmulas nunca viram dado: são recalculadas e comparadas ao valor em cache;
 *  - todo conteúdo não mapeado vira pendência (nada é descartado em silêncio).
 */
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import { CATALOGO_FAMILIAS_PADRAO, type FamiliaCatalogo, normalizarTexto, resolverFamilia } from './familias'

type Worksheet = ExcelJS.Worksheet
type Cell = ExcelJS.Cell

export type AreaImportacao = 'MANUT_INTERNA' | 'MANUT_EXTERNA' | 'ESTOQUE_PECAS' | 'COMODATO' | 'TI'
export type DimensaoTipo = 'FAMILIA_EQUIP' | 'TECNICO' | 'REDE' | 'CLIENTE' | 'FAMILIA_PECA'
export type TipoPendencia =
  | 'SEM_MAPEAMENTO' | 'VALOR_INVALIDO' | 'FORMULA_INVALIDA' | 'DUPLICIDADE' | 'TOTAL_INCOMPATIVEL'
  | 'DADO_TESTE' | 'CONCILIACAO' | 'DIVERGENCIA_FONTE' | 'INFORMATIVO'

export interface SerieLinha {
  area: AreaImportacao
  serie: string
  dimensaoTipo: DimensaoTipo | null
  /** Texto original (sem espaços nas pontas). */
  dimensaoValor: string | null
  competencia: string
  valor: number
  aba: string
  celula: string
}

export interface DetalheLinha {
  area: AreaImportacao
  tipo: 'DESNECESSARIO' | 'EQUIP_CLIENTE'
  competencia: string
  dados: Record<string, string | number | null>
  aba: string
  faixa: string
}

export interface TrocaLinha {
  competencia: string
  clienteTexto: string
  dataSolicitacao: string
  dataTroca: string | null
  status: 'PENDENTE' | 'CONCLUIDA'
  solicitadoPorTexto: string | null
  equipamentoTexto: string | null
  linha: 'PADRAO' | 'STAR' | null
  observacao: string | null
  aba: string
  linhaPlanilha: number
}

export interface PosicaoComodatoLinha {
  competencia: string
  produto: string
  posicaoAnterior: number
  entradas: number
  saidasNovos: number
  saidasUsados: number
  novos: number
  usados: number
  atual: number | null
  manutencaoInterna: number | null
  custoTotalNovos: number | null
  custoTotalUsados: number | null
  ajuste: number
  justificativaAjuste: string | null
  aba: string
  linhaPlanilha: number
}

export interface ChamadoTiRestrito {
  emailTecnico: string | null
  emailSolicitante: string | null
  ramal: string | null
  ipAbertura: string | null
  fechadoPorEmail: string | null
  escaladoPorEmail: string | null
}

export interface ChamadoTiLinha {
  numero: string
  sistemaOrigem: 'TI' | 'LINEAR' | 'OUTRO'
  competencia: string
  titulo: string | null
  status: string
  statusNormalizado: 'ABERTO' | 'EM_ATENDIMENTO' | 'AGUARDANDO' | 'ESCALADO' | 'RESOLVIDO' | 'CANCELADO'
  tipo: string | null
  prioridade: string | null
  origemCanal: string | null
  nivelSuporte: string | null
  categoria: string | null
  subcategoria: string | null
  equipe: string | null
  tecnicoResponsavel: string | null
  solicitante: string | null
  departamento: string | null
  unidadeTexto: string | null
  abertoEm: string
  slaPrazo: string | null
  slaViolado: boolean | null
  slaVioladoEm: string | null
  slaHorasPausadas: number | null
  slaDesvioH: number | null
  solucao: string | null
  causaRaiz: string | null
  motivoCancelamento: string | null
  fechadoEm: string | null
  tempoResolucaoOrigemH: number | null
  escaladoEm: string | null
  csatNota: number | null
  csatComentario: string | null
  csatRespondidoEm: string | null
  tags: string[] | null
  ultimaAtualizacaoEm: string | null
  dadoTeste: boolean
  aba: string
  linhaPlanilha: number
  restrito: ChamadoTiRestrito
}

export interface PropostaMapeamento {
  /** Texto normalizado (chave única da proposta). */
  chave: string
  entidade: 'FAMILIA_EQUIPAMENTO'
  textoOriginal: string
  /** Família existente sugerida (nulo = criar família nova ou decidir manualmente). */
  sugestao: string | null
  acao: 'ALIAS' | 'NOVA_FAMILIA' | 'MANUAL'
  /** Se aceito, grava o texto como sinônimo (somente rótulos de séries/produtos). */
  criarAlias: boolean
  motivo: string
  ocorrencias: string[]
}

export interface PendenciaAnalise {
  aba: string
  celula: string | null
  tipo: TipoPendencia
  descricao: string
  valorBruto?: unknown
}

export interface TotalConferido {
  aba: string
  celula: string
  descricao: string
  valorPlanilha: number | null
  valorCalculado: number | null
  confere: boolean
}

/** Consulta do lado "sistema" usada na reconciliação pós-gravação. */
export type ConsultaSistema =
  | { tipo: 'SERIE_SOMA'; series: string[] }
  | { tipo: 'SERIE_CONTAGEM'; serie: string }
  | { tipo: 'TROCAS' }
  | { tipo: 'DETALHE'; detalhe: 'EQUIP_CLIENTE' | 'DESNECESSARIO' }
  | { tipo: 'COMODATO'; campo: 'custo_total_usados' | 'custo_total_novos' | 'novos_usados' }
  | { tipo: 'TI'; metrica: 'TI' | 'LINEAR' | 'TOTAL' | 'ABERTOS_TI' | 'RESOLVIDOS_TI' | 'CANCELADOS_TI' | 'SLA_VIOLADO_TI' | 'TEMPO_MEDIO_TI' }

export interface ReferenciaReconciliacao {
  aba: string
  serie: string
  competencia: string | null
  planilha: number
  celula: string | null
  consulta: ConsultaSistema
}

export interface ResumoAba {
  aba: string
  blocos: { titulo: string; destino: string; faixa: string; registros: number }[]
}

export interface AnalisePlanilha {
  arquivo: { nome: string; sha256: string; tamanho: number }
  abas: ResumoAba[]
  series: SerieLinha[]
  detalhes: DetalheLinha[]
  trocas: TrocaLinha[]
  posicoesComodato: PosicaoComodatoLinha[]
  chamadosTi: ChamadoTiLinha[]
  propostasMapeamento: PropostaMapeamento[]
  pendencias: PendenciaAnalise[]
  totaisConferidos: TotalConferido[]
  referencias: ReferenciaReconciliacao[]
  /** Texto de família (normalizado) -> família do catálogo resolvida sem ambiguidade. */
  familiasResolvidas: Record<string, string>
}

export const ABAS = {
  interna: 'Equipe Interna',
  externa: 'Equipe Externa',
  estoque: 'Estoque',
  entregas: 'Entrega e retirada Comodato',
  estoqueComodato: 'Estoque Comodato',
  ti: 'T.I',
} as const

/* ------------------------------------------------------------------ */
/* Utilitários de célula                                               */
/* ------------------------------------------------------------------ */

const EPOCA_EXCEL = Date.UTC(1899, 11, 30)
const TOLERANCIA = 0.005

export function letraColuna(c: number): string {
  let s = ''
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}
const endereco = (r: number, c: number) => `${letraColuna(c)}${r}`

function ehEscravoMesclado(cell: Cell): boolean {
  return cell.isMerged && cell.master.address !== cell.address
}

type ValorFormula = { formula?: string; sharedFormula?: string; result?: unknown }
function ehFormula(v: unknown): v is ValorFormula {
  return !!v && typeof v === 'object' && !(v instanceof Date) && ('formula' in v || 'sharedFormula' in v)
}

/** Valor "puro" da célula (resolve rich text, hyperlink e fórmula -> resultado). */
function valorBase(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (ehFormula(v)) return v.result ?? null
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return String(o.text)
    if ('error' in o) return null
    return null
  }
  return v
}

function texto(cell: Cell): string | null {
  if (ehEscravoMesclado(cell)) return null
  const v = valorBase(cell.value)
  if (v === null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return s === '' ? null : s
}

function vazia(cell: Cell): boolean {
  if (ehEscravoMesclado(cell)) return true
  const v = cell.value
  if (v === null || v === undefined) return true
  if (ehFormula(v)) return false
  const b = valorBase(v)
  return b === null || (typeof b === 'string' && b.trim() === '')
}

const serialDeData = (d: Date) => (d.getTime() - EPOCA_EXCEL) / 86_400_000

/** Converte texto numérico (pt-BR ou en) em número. */
function numeroDeTexto(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/, '')
  if (!t) return null
  let n: string
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)) n = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+(,\d+)$/.test(t)) n = t.replace(',', '.')
  else n = t
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

type LeituraNumero = { tipo: 'vazio' } | { tipo: 'numero'; valor: number } | { tipo: 'invalido'; bruto: unknown } | { tipo: 'formula'; bruto: unknown }

function lerNumero(cell: Cell): LeituraNumero {
  if (vazia(cell)) return { tipo: 'vazio' }
  const v = cell.value
  if (ehFormula(v)) return { tipo: 'formula', bruto: cell.formula }
  const b = valorBase(v)
  if (typeof b === 'number') return { tipo: 'numero', valor: b }
  if (b instanceof Date) return { tipo: 'numero', valor: serialDeData(b) }
  if (typeof b === 'string') {
    const n = numeroDeTexto(b)
    return n === null ? { tipo: 'invalido', bruto: b } : { tipo: 'numero', valor: n }
  }
  return { tipo: 'invalido', bruto: b }
}

/** Valor em cache de uma fórmula. O exceljs descarta zeros em cache de fórmulas compartilhadas: ausente = 0. */
function cacheFormula(cell: Cell): { ok: true; valor: number; ausente?: boolean } | { ok: false; bruto: unknown } {
  const v = cell.value as ValorFormula
  const r = v.result
  if (r === undefined || r === null) return { ok: true, valor: 0, ausente: true }
  if (typeof r === 'number') return { ok: true, valor: r }
  if (r instanceof Date) return { ok: true, valor: serialDeData(r) }
  if (typeof r === 'string') {
    const n = numeroDeTexto(r)
    return n === null ? { ok: false, bruto: r } : { ok: true, valor: n }
  }
  return { ok: false, bruto: r }
}

function competenciaDeData(v: unknown): string | null {
  const b = valorBase(v)
  if (b instanceof Date) return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-01`
  if (typeof b === 'number' && b > 20000 && b < 80000) return competenciaDeData(new Date(EPOCA_EXCEL + b * 86_400_000))
  return null
}

function dataIso(v: unknown): string | null {
  const b = valorBase(v)
  if (b instanceof Date) return b.toISOString().slice(0, 10)
  if (typeof b === 'string') {
    const m = b.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return null
}

/** "31/08/2026, 16:58:10" (America/Sao_Paulo) -> "2026-08-31T16:58:10-03:00". */
export function dataHoraSaoPaulo(s: string | null): string | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [, d, mo, y, h = '00', mi = '00', se = '00'] = m
  return `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${se}-03:00`
}

/** "16.1h" / "-4h" / "+5,2 h" -> número. */
export function horasDeTexto(v: unknown): number | null {
  const b = valorBase(v)
  if (typeof b === 'number') return b
  if (typeof b !== 'string') return null
  const m = b.trim().replace(',', '.').match(/^([+-]?\d+(?:\.\d+)?)\s*h?$/i)
  return m ? Number(m[1]) : null
}

const iguais = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA
const arred = (n: number, c = 4) => Math.round(n * 10 ** c) / 10 ** c

/* ------------------------------------------------------------------ */
/* Contexto de análise                                                 */
/* ------------------------------------------------------------------ */

class Contexto {
  series: SerieLinha[] = []
  detalhes: DetalheLinha[] = []
  trocas: TrocaLinha[] = []
  posicoes: PosicaoComodatoLinha[] = []
  chamados: ChamadoTiLinha[] = []
  pendencias: PendenciaAnalise[] = []
  totais: TotalConferido[] = []
  referencias: ReferenciaReconciliacao[] = []
  abas = new Map<string, ResumoAba>()
  consumidas = new Map<string, Set<string>>()
  /** chave normalizada -> {original, ocorrencias, contextos} */
  textosFamilia = new Map<string, { original: string; ocorrencias: string[]; rotulo: boolean }>()
  chavesSerie = new Set<string>()

  constructor(public catalogo: FamiliaCatalogo[]) {}

  consumir(aba: string, r: number, c: number) {
    let s = this.consumidas.get(aba)
    if (!s) this.consumidas.set(aba, (s = new Set()))
    s.add(endereco(r, c))
  }
  consumirLinha(ws: Worksheet, r: number) {
    const row = ws.getRow(r)
    row.eachCell({ includeEmpty: false }, (cell, c) => this.consumir(ws.name, r, c))
  }
  pendencia(p: PendenciaAnalise) {
    this.pendencias.push(p)
  }
  bloco(aba: string, titulo: string, destino: string, faixa: string, registros: number) {
    let a = this.abas.get(aba)
    if (!a) this.abas.set(aba, (a = { aba, blocos: [] }))
    a.blocos.push({ titulo, destino, faixa, registros })
  }
  total(t: Omit<TotalConferido, 'confere'> & { confere?: boolean }) {
    const confere = t.confere ?? (t.valorPlanilha !== null && t.valorCalculado !== null && iguais(t.valorPlanilha, t.valorCalculado))
    const reg: TotalConferido = { ...t, valorPlanilha: t.valorPlanilha === null ? null : arred(t.valorPlanilha), valorCalculado: t.valorCalculado === null ? null : arred(t.valorCalculado), confere }
    this.totais.push(reg)
    if (!confere) {
      this.pendencia({
        aba: t.aba, celula: t.celula, tipo: 'TOTAL_INCOMPATIVEL',
        descricao: `${t.descricao}: planilha ${reg.valorPlanilha ?? 'sem valor'} x recalculado ${reg.valorCalculado ?? 'sem valor'}`,
        valorBruto: { planilha: reg.valorPlanilha, calculado: reg.valorCalculado },
      })
    }
    return confere
  }
  registrarFamilia(textoOriginal: string, ocorrencia: string, rotulo: boolean) {
    const chave = normalizarTexto(textoOriginal)
    if (!chave) return
    const e = this.textosFamilia.get(chave)
    if (e) {
      e.ocorrencias.push(ocorrencia)
      e.rotulo ||= rotulo
    } else this.textosFamilia.set(chave, { original: textoOriginal.trim(), ocorrencias: [ocorrencia], rotulo })
  }
  serie(l: SerieLinha): boolean {
    const k = `${l.serie}|${normalizarTexto(l.dimensaoValor ?? '')}|${l.competencia}`
    if (this.chavesSerie.has(k)) {
      this.pendencia({ aba: l.aba, celula: l.celula, tipo: 'DUPLICIDADE', descricao: `Valor repetido para ${l.serie} / ${l.dimensaoValor ?? '—'} em ${l.competencia.slice(0, 7)}: mantido o primeiro`, valorBruto: { valor: l.valor } })
      return false
    }
    this.chavesSerie.add(k)
    this.series.push(l)
    return true
  }
}

/* ------------------------------------------------------------------ */
/* Localização de blocos                                               */
/* ------------------------------------------------------------------ */

function acharTitulos(ws: Worksheet, re: RegExp, maxCol = 30): { r: number; c: number; texto: string }[] {
  const out: { r: number; c: number; texto: string }[] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= Math.min(maxCol, row.cellCount); c++) {
      const cell = row.getCell(c)
      const t = texto(cell)
      if (t && re.test(normalizarTexto(t))) {
        out.push({ r, c, texto: t })
        break
      }
    }
  }
  return out
}

/** Colunas de mês de uma linha de cabeçalho (datas). */
function colunasMes(ws: Worksheet, r: number, c0 = 1, c1 = 20): Map<number, string> {
  const m = new Map<number, string>()
  const row = ws.getRow(r)
  for (let c = c0; c <= c1; c++) {
    const comp = competenciaDeData(row.getCell(c).value)
    if (comp) m.set(c, comp)
  }
  return m
}

function colunaPorRotulo(ws: Worksheet, r: number, re: RegExp, c1 = 20): number | null {
  const row = ws.getRow(r)
  for (let c = 1; c <= c1; c++) {
    const t = texto(row.getCell(c))
    if (t && re.test(normalizarTexto(t))) return c
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Validação de fórmulas de total/média                                */
/* ------------------------------------------------------------------ */

function celulasDaFormula(f: string): { funcao: 'SUM' | 'AVERAGE' | null; celulas: string[] | null; somaInterna: boolean } {
  const s = f.replace(/\s+/g, '').replace(/^=/, '').toUpperCase()
  const m = s.match(/^(SUM|AVERAGE)\((.*)\)$/)
  const expandir = (arg: string): string[] | null => {
    const faixa = arg.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    if (faixa) {
      const [, ca, ra, cb, rb] = faixa
      const ci = colunaNumero(ca), cf = colunaNumero(cb)
      const out: string[] = []
      for (let r = Number(ra); r <= Number(rb); r++) for (let c = ci; c <= cf; c++) out.push(endereco(r, c))
      return out
    }
    if (/^([A-Z]+\d+)(\+[A-Z]+\d+)*$/.test(arg)) return arg.split('+')
    return null
  }
  if (!m) return { funcao: null, celulas: expandir(s), somaInterna: false }
  const arg = m[2]
  const somaInterna = /^[A-Z]+\d+\+[A-Z]+\d+/.test(arg)
  return { funcao: m[1] as 'SUM' | 'AVERAGE', celulas: expandir(arg), somaInterna }
}
function colunaNumero(l: string): number {
  let n = 0
  for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

type Agregacao = 'SOMA' | 'MEDIA'

/**
 * Confere uma célula de total/média: recalcula a partir das células esperadas
 * (vazias ignoradas, como no Excel) e compara ao cache. Retorna se a fórmula
 * tem a forma esperada.
 */
function conferirAgregado(ctx: Contexto, ws: Worksheet, cell: Cell, esperadas: string[], agreg: Agregacao, descricao: string): { formulaValida: boolean } {
  const valores: number[] = []
  for (const a of esperadas) {
    const l = lerNumero(ws.getCell(a))
    if (l.tipo === 'numero') valores.push(l.valor)
    else if (l.tipo === 'formula') {
      const cf = cacheFormula(ws.getCell(a))
      if (cf.ok) valores.push(cf.valor)
    }
  }
  const calculado = agreg === 'SOMA' ? valores.reduce((s, x) => s + x, 0) : valores.length ? valores.reduce((s, x) => s + x, 0) / valores.length : null
  let planilha: number | null = null
  let formulaValida = true
  if (ehFormula(cell.value)) {
    const cf = cacheFormula(cell)
    // Sem valores a agregar: cache ausente ou zero equivale a "sem valor" (Excel devolve 0 ou #DIV/0!).
    planilha = cf.ok ? (calculado === null && (cf.ausente || cf.valor === 0) ? null : cf.valor) : null
    const f = cell.formula ?? ''
    const an = celulasDaFormula(f)
    const conjunto = new Set(esperadas)
    const mesmoConjunto = !!an.celulas && an.celulas.length === conjunto.size && an.celulas.every((x) => conjunto.has(x))
    if (agreg === 'SOMA') formulaValida = mesmoConjunto && (an.funcao === 'SUM' || an.funcao === null)
    else formulaValida = mesmoConjunto && an.funcao === 'AVERAGE' && !an.somaInterna
  } else {
    const l = lerNumero(cell)
    planilha = l.tipo === 'numero' ? l.valor : null
  }
  ctx.consumir(ws.name, Number(cell.row), Number(cell.col))
  ctx.total({ aba: ws.name, celula: cell.address, descricao, valorPlanilha: planilha, valorCalculado: calculado, confere: calculado === null && planilha === null ? true : undefined })
  return { formulaValida }
}

/* ------------------------------------------------------------------ */
/* Bloco matricial: rótulo na coluna A, meses nas colunas, Total/Média */
/* ------------------------------------------------------------------ */

interface ConfigMatriz {
  titulo: RegExp
  area: AreaImportacao
  /** Série fixa ou por rótulo da linha (nulo = linha sem mapeamento). */
  serie: string | ((rotulo: string) => string | null)
  dimensao: DimensaoTipo | null
  descricao: string
  /** Linha de totais esperada (TOTAL/TOTAL GERAL) conferida contra as linhas. */
  seriesTotal?: string[]
}

function lerMatriz(ctx: Contexto, ws: Worksheet, cfg: ConfigMatriz, ocorrencia?: { r: number; c: number }) {
  const t = ocorrencia ?? acharTitulos(ws, cfg.titulo, 1)[0]
  if (!t) {
    ctx.pendencia({ aba: ws.name, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: `Bloco "${cfg.descricao}" não encontrado na aba` })
    return
  }
  ctx.consumirLinha(ws, t.r)
  // Cabeçalho: primeira linha (até 3 abaixo) com ≥ 6 datas.
  let rh = 0
  let meses = new Map<number, string>()
  for (let r = t.r + 1; r <= t.r + 3; r++) {
    const m = colunasMes(ws, r, 2, 16)
    if (m.size >= 6) {
      rh = r
      meses = m
      break
    }
  }
  if (!rh) {
    ctx.pendencia({ aba: ws.name, celula: endereco(t.r, 1), tipo: 'SEM_MAPEAMENTO', descricao: `Bloco "${cfg.descricao}": cabeçalho de meses não encontrado` })
    return
  }
  ctx.consumirLinha(ws, rh)
  const cTotal = colunaPorRotulo(ws, rh, /^TOTAL$/)
  const cMedia = colunaPorRotulo(ws, rh, /^M.DIA$/)
  const colsMes = [...meses.keys()]
  let formulaMediaInvalida: string | null = null
  let formulaTotalInvalida: string | null = null
  let registros = 0
  const linhasDados: number[] = []
  let r = rh + 1
  const seriesDoBloco = new Set<string>()
  for (; r <= ws.rowCount; r++) {
    const rotuloCell = ws.getRow(r).getCell(1)
    const rotulo = texto(rotuloCell)
    if (!rotulo) break
    const rn = normalizarTexto(rotulo)
    if (/^TOTAL/.test(rn)) break
    linhasDados.push(r)
    ctx.consumir(ws.name, r, 1)
    const serie = typeof cfg.serie === 'string' ? cfg.serie : cfg.serie(rn)
    if (!serie) {
      ctx.pendencia({ aba: ws.name, celula: endereco(r, 1), tipo: 'SEM_MAPEAMENTO', descricao: `Linha "${rotulo}" do bloco "${cfg.descricao}" sem série correspondente` })
      continue
    }
    seriesDoBloco.add(serie)
    if (cfg.dimensao === 'FAMILIA_EQUIP') ctx.registrarFamilia(rotulo, `${ws.name}!${endereco(r, 1)}`, true)
    for (const c of colsMes) {
      const cell = ws.getRow(r).getCell(c)
      const l = lerNumero(cell)
      ctx.consumir(ws.name, r, c)
      if (l.tipo === 'vazio') continue
      if (l.tipo !== 'numero') {
        ctx.pendencia({ aba: ws.name, celula: cell.address, tipo: 'VALOR_INVALIDO', descricao: l.tipo === 'formula' ? 'Fórmula em célula de dado mensal (não importada)' : 'Valor não numérico em célula de dado mensal', valorBruto: l.bruto })
        continue
      }
      if (ctx.serie({ area: cfg.area, serie, dimensaoTipo: cfg.dimensao, dimensaoValor: cfg.dimensao ? rotulo : null, competencia: meses.get(c)!, valor: l.valor, aba: ws.name, celula: cell.address })) registros++
    }
    const esperadas = colsMes.map((c) => endereco(r, c))
    if (cTotal && !vazia(ws.getRow(r).getCell(cTotal))) {
      const { formulaValida } = conferirAgregado(ctx, ws, ws.getRow(r).getCell(cTotal), esperadas, 'SOMA', `Total de "${rotulo}" (${cfg.descricao})`)
      if (!formulaValida && !formulaTotalInvalida) formulaTotalInvalida = endereco(r, cTotal)
    }
    if (cMedia && !vazia(ws.getRow(r).getCell(cMedia))) {
      const { formulaValida } = conferirAgregado(ctx, ws, ws.getRow(r).getCell(cMedia), esperadas, 'MEDIA', `Média de "${rotulo}" (${cfg.descricao})`)
      if (!formulaValida && !formulaMediaInvalida) formulaMediaInvalida = endereco(r, cMedia)
    }
  }
  const primeira = linhasDados[0] ?? rh + 1
  const ultima = linhasDados[linhasDados.length - 1] ?? rh
  if (formulaMediaInvalida) {
    ctx.pendencia({
      aba: ws.name, celula: `${letraColuna(cMedia!)}${primeira}:${letraColuna(cMedia!)}${ultima}`, tipo: 'FORMULA_INVALIDA',
      descricao: `Coluna de média do bloco "${cfg.descricao}" não calcula a média dos meses (ex.: ${formulaMediaInvalida} = ${ws.getCell(formulaMediaInvalida).formula}); fórmula ignorada, média recalculada`,
    })
  }
  if (formulaTotalInvalida) {
    ctx.pendencia({
      aba: ws.name, celula: `${letraColuna(cTotal!)}${primeira}:${letraColuna(cTotal!)}${ultima}`, tipo: 'FORMULA_INVALIDA',
      descricao: `Coluna de total do bloco "${cfg.descricao}" não soma exatamente os meses (ex.: ${formulaTotalInvalida}); total recalculado`,
    })
  }
  // Linha de totais (TOTAL / TOTAL GERAL): confere cada coluna preenchida.
  const rotuloTotal = texto(ws.getRow(r).getCell(1))
  if (rotuloTotal && /^TOTAL/.test(normalizarTexto(rotuloTotal))) {
    ctx.consumir(ws.name, r, 1)
    for (const c of colsMes) {
      const cell = ws.getRow(r).getCell(c)
      if (vazia(cell)) continue
      conferirAgregado(ctx, ws, cell, linhasDados.map((x) => endereco(x, c)), 'SOMA', `${rotuloTotal} de ${meses.get(c)!.slice(0, 7)} (${cfg.descricao})`)
      const lt = lerNumero(cell)
      const cf = lt.tipo === 'formula' ? cacheFormula(cell) : lt.tipo === 'numero' ? { ok: true as const, valor: lt.valor } : null
      if (cf?.ok) {
        ctx.referencias.push({ aba: ws.name, serie: `${cfg.descricao} — ${rotuloTotal}`, competencia: meses.get(c)!, planilha: arred(cf.valor), celula: cell.address, consulta: { tipo: 'SERIE_SOMA', series: cfg.seriesTotal ?? [...seriesDoBloco] } })
      }
    }
    const linhaTot = linhasDados.length ? colsMes.map((c) => endereco(r, c)) : []
    if (cTotal && !vazia(ws.getRow(r).getCell(cTotal))) conferirAgregado(ctx, ws, ws.getRow(r).getCell(cTotal), linhaTot, 'SOMA', `${rotuloTotal} anual (${cfg.descricao})`)
    if (cMedia && !vazia(ws.getRow(r).getCell(cMedia))) conferirAgregado(ctx, ws, ws.getRow(r).getCell(cMedia), linhaTot, 'MEDIA', `${rotuloTotal} média (${cfg.descricao})`)
    ctx.consumirLinha(ws, r)
    r++
  }
  // Rótulos "Formula não digitar" e afins na linha do título ficam consumidos junto do título.
  ctx.bloco(ws.name, cfg.descricao, typeof cfg.serie === 'string' ? cfg.serie : [...seriesDoBloco].join(', '), `A${t.r}:${letraColuna(cMedia ?? cTotal ?? 13)}${r - 1}`, registros)
}

/* ------------------------------------------------------------------ */
/* Resumo mensal em linha (meses em A..L)                              */
/* ------------------------------------------------------------------ */

function lerResumoLinha(ctx: Contexto, ws: Worksheet, t: { r: number; c: number }, area: AreaImportacao, serie: string | null, descricao: string): Map<string, { valor: number; celula: string }> {
  const out = new Map<string, { valor: number; celula: string }>()
  ctx.consumirLinha(ws, t.r)
  const rh = t.r + 1
  const meses = colunasMes(ws, rh, 1, 14)
  ctx.consumirLinha(ws, rh)
  const rv = rh + 1
  const cTotal = colunaPorRotulo(ws, rh, /^TOTAL$/)
  const cMedia = colunaPorRotulo(ws, rh, /^M.DIA$/)
  let registros = 0
  for (const [c, comp] of meses) {
    const cell = ws.getRow(rv).getCell(c)
    ctx.consumir(ws.name, rv, c)
    const l = lerNumero(cell)
    if (l.tipo === 'vazio') continue
    if (l.tipo !== 'numero') {
      ctx.pendencia({ aba: ws.name, celula: cell.address, tipo: 'VALOR_INVALIDO', descricao: `Valor inválido no resumo "${descricao}"`, valorBruto: l.bruto })
      continue
    }
    out.set(comp, { valor: l.valor, celula: cell.address })
    if (serie && ctx.serie({ area, serie, dimensaoTipo: null, dimensaoValor: null, competencia: comp, valor: l.valor, aba: ws.name, celula: cell.address })) registros++
  }
  const esperadas = [...meses.keys()].map((c) => endereco(rv, c))
  for (const [col, ag] of [[cTotal, 'SOMA'], [cMedia, 'MEDIA']] as const) {
    if (!col || vazia(ws.getRow(rv).getCell(col))) continue
    const { formulaValida } = conferirAgregado(ctx, ws, ws.getRow(rv).getCell(col), esperadas, ag, `${ag === 'SOMA' ? 'Total' : 'Média'} do resumo "${descricao}"`)
    if (!formulaValida) {
      ctx.pendencia({ aba: ws.name, celula: endereco(rv, col), tipo: 'FORMULA_INVALIDA', descricao: `Fórmula de ${ag === 'SOMA' ? 'total' : 'média'} do resumo "${descricao}" não cobre exatamente os 12 meses (${ws.getRow(rv).getCell(col).formula}); valor recalculado` })
    }
  }
  ctx.bloco(ws.name, descricao, serie ?? 'conferência', `${endereco(t.r, 1)}:${letraColuna(cMedia ?? 14)}${rv}`, registros)
  return out
}

/* ------------------------------------------------------------------ */
/* Blocos mensais lado a lado ("Mês" + data)                           */
/* ------------------------------------------------------------------ */

interface BlocoMes {
  cRotulo: number
  competencia: string
  colunas: Map<string, number> // campo -> coluna
}

function blocosMes(ctx: Contexto, ws: Worksheet, rMes: number, rCab: number, campos: [string, RegExp][]): BlocoMes[] {
  const out: BlocoMes[] = []
  const row = ws.getRow(rMes)
  const maxC = Math.max(row.cellCount, ws.getRow(rCab).cellCount)
  const rotulos: number[] = []
  for (let c = 1; c <= maxC; c++) {
    const t = texto(row.getCell(c))
    if (t && /^MES$/.test(normalizarTexto(t))) rotulos.push(c)
  }
  rotulos.forEach((c, i) => {
    const comp = competenciaDeData(row.getCell(c + 1).value)
    const fim = (rotulos[i + 1] ?? maxC + 1) - 1
    if (!comp) {
      ctx.pendencia({ aba: ws.name, celula: endereco(rMes, c + 1), tipo: 'VALOR_INVALIDO', descricao: 'Bloco mensal sem data reconhecível' })
      return
    }
    const colunas = new Map<string, number>()
    for (let k = c; k <= fim; k++) {
      const h = texto(ws.getRow(rCab).getCell(k))
      if (!h) continue
      const hn = normalizarTexto(h)
      const campo = campos.find(([, re]) => re.test(hn))
      if (campo && !colunas.has(campo[0])) colunas.set(campo[0], k)
    }
    out.push({ cRotulo: c, competencia: comp, colunas })
  })
  ctx.consumirLinha(ws, rMes)
  ctx.consumirLinha(ws, rCab)
  return out
}

/* ------------------------------------------------------------------ */
/* Equipe Interna                                                      */
/* ------------------------------------------------------------------ */

function analisarInterna(ctx: Contexto, ws: Worksheet) {
  const blocos: ConfigMatriz[] = [
    { titulo: /MANUTENCAO INTERNA POR EQUIPAMENTO/, area: 'MANUT_INTERNA', serie: 'MI_RECUPERADOS', dimensao: 'FAMILIA_EQUIP', descricao: 'Manutenção interna por equipamento' },
    { titulo: /EQUIPAMENTOS MAIS SUCATEADOS/, area: 'MANUT_INTERNA', serie: 'MI_SUCATEADOS', dimensao: 'FAMILIA_EQUIP', descricao: 'Equipamentos mais sucateados' },
    { titulo: /LAVAGENS POR EQUIPAMENTO/, area: 'MANUT_INTERNA', serie: 'MI_LAVAGENS', dimensao: 'FAMILIA_EQUIP', descricao: 'Lavagens por equipamento' },
    { titulo: /PECAS UTILIZADAS INTERNAMENTE/, area: 'MANUT_INTERNA', serie: 'MI_PECAS_QTD', dimensao: 'FAMILIA_PECA', descricao: 'Peças utilizadas internamente' },
  ]
  for (const b of blocos) lerMatriz(ctx, ws, b)
  estimativasValor(ctx, ws)
}

/** Quadros laterais "Valor Unitario / Valor Final": estimativas sem fórmula homologada. */
function estimativasValor(ctx: Contexto, ws: Worksheet) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    for (let c = 2; c <= row.cellCount; c++) {
      const t = texto(row.getCell(c))
      if (!t || normalizarTexto(t) !== 'VALOR UNITARIO') continue
      // Faixa: da linha de título (acima) até a linha de TOTAL (abaixo), colunas c-1..c+2.
      let fim = r + 1
      while (fim <= ws.rowCount && fim < r + 60) {
        const tt = [c - 1, c, c + 1].map((k) => texto(ws.getRow(fim).getCell(k)) ?? '').join(' ')
        if (/TOTAL/.test(normalizarTexto(tt))) break
        fim++
      }
      const ini = r - 1
      let total: number | null = null
      for (let rr = ini; rr <= fim; rr++) for (let k = c - 1; k <= c + 2; k++) {
        const cell = ws.getRow(rr).getCell(k)
        if (!vazia(cell)) ctx.consumir(ws.name, rr, k)
        if (rr === fim && ehFormula(cell.value)) {
          const cf = cacheFormula(cell)
          if (cf.ok) total = cf.valor
        }
      }
      const tituloBloco = texto(ws.getRow(ini).getCell(c)) ?? ''
      const perda = /SUCAT/.test(normalizarTexto(tituloBloco))
      ctx.pendencia({
        aba: ws.name, celula: `${letraColuna(c - 1)}${ini}:${letraColuna(c + 1)}${fim}`, tipo: 'DIVERGENCIA_FONTE',
        descricao: `Estimativa de ${perda ? 'perda' : 'economia'} (valor unitário x quantidade) sem fórmula homologada: não importada como dado`,
        valorBruto: { total_planilha: total === null ? null : arred(total, 2) },
      })
      ctx.bloco(ws.name, `Estimativa de ${perda ? 'perda' : 'economia'} (quadro lateral)`, 'não importado (pendência)', `${letraColuna(c - 1)}${ini}:${letraColuna(c + 1)}${fim}`, 0)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Equipe Externa                                                      */
/* ------------------------------------------------------------------ */

function analisarExterna(ctx: Contexto, ws: Worksheet) {
  const aba = ws.name
  lerMatriz(ctx, ws, { titulo: /TECNICOS COM MAIS ATENDIMENTO/, area: 'MANUT_EXTERNA', serie: 'ME_ATENDIMENTOS', dimensao: 'TECNICO', descricao: 'Atendimentos externos por técnico' })
  lerMatriz(ctx, ws, { titulo: /TECNICOS COM MAIS REINCIDEN/, area: 'MANUT_EXTERNA', serie: 'ME_REINCIDENCIAS', dimensao: 'TECNICO', descricao: 'Reincidências por técnico' })
  lerMatriz(ctx, ws, { titulo: /MANUTENCAO EXTERNO? POR EQUIPAMENTO/, area: 'MANUT_EXTERNA', serie: 'ME_CHAMADOS', dimensao: 'FAMILIA_EQUIP', descricao: 'Manutenção externa por equipamento' })
  lerMatriz(ctx, ws, { titulo: /MANUTENCAO EXTERNO? POR REDE/, area: 'MANUT_EXTERNA', serie: 'ME_CHAMADOS_REDE', dimensao: 'REDE', descricao: 'Manutenção externa por rede' })
  lerMatriz(ctx, ws, {
    titulo: /QUANTOS CHAMADOS DESNECESSARIOS/, area: 'MANUT_EXTERNA', dimensao: null, descricao: 'Chamados necessários x desnecessários',
    serie: (rot) => (/^(NAO|N)$/.test(rot) ? 'ME_NECESSARIOS' : /^(SIM|S)$/.test(rot) ? 'ME_DESNECESSARIOS' : null),
  })
  lerMatriz(ctx, ws, { titulo: /PECAS UTILIZADAS EXTERNAMENTE/, area: 'MANUT_EXTERNA', serie: 'ME_PECAS_QTD', dimensao: 'FAMILIA_PECA', descricao: 'Peças utilizadas externamente' })

  // Clientes com mais chamados (blocos mensais) + resumo de contagem
  const titulosClientes = acharTitulos(ws, /^CLIENTES COM MAIS CHAMADOS/)
  const tBlocos = titulosClientes.find((t) => /^MES$/.test(normalizarTexto(texto(ws.getRow(t.r + 1).getCell(1)) ?? '')))
  const contagemClientes = new Map<string, number>()
  if (tBlocos) {
    ctx.consumirLinha(ws, tBlocos.r)
    const blocos = blocosMes(ctx, ws, tBlocos.r + 1, tBlocos.r + 2, [['fantasia', /^FANTASIA/], ['quantidade', /^QUANTIDADE/]])
    let registros = 0
    let r = tBlocos.r + 3
    for (; r <= ws.rowCount; r++) {
      let algum = false
      for (const b of blocos) {
        const cf = b.colunas.get('fantasia') ?? b.cRotulo
        const cq = b.colunas.get('quantidade') ?? b.cRotulo + 1
        const f = texto(ws.getRow(r).getCell(cf))
        const qCell = ws.getRow(r).getCell(cq)
        if (!f && vazia(qCell)) continue
        algum = true
        ctx.consumir(aba, r, cf)
        ctx.consumir(aba, r, cq)
        contagemClientes.set(b.competencia, (contagemClientes.get(b.competencia) ?? 0) + 1)
        const q = lerNumero(qCell)
        if (!f || q.tipo !== 'numero') {
          ctx.pendencia({ aba, celula: endereco(r, cf), tipo: 'VALOR_INVALIDO', descricao: 'Cliente com mais chamados sem fantasia ou sem quantidade numérica', valorBruto: { fantasia: f, quantidade: q.tipo === 'numero' ? q.valor : null } })
          continue
        }
        if (ctx.serie({ area: 'MANUT_EXTERNA', serie: 'ME_CHAMADOS_CLIENTE', dimensaoTipo: 'CLIENTE', dimensaoValor: f, competencia: b.competencia, valor: q.valor, aba, celula: qCell.address })) registros++
      }
      if (!algum) break
    }
    ctx.bloco(aba, 'Clientes com mais chamados', 'ME_CHAMADOS_CLIENTE', `A${tBlocos.r}:${letraColuna(Math.max(...blocos.map((b) => b.cRotulo + 1)))}${r - 1}`, registros)
  } else ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Bloco "Clientes com mais chamados" não encontrado' })
  const tResumoCli = titulosClientes.find((t) => t !== tBlocos && competenciaDeData(ws.getRow(t.r + 1).getCell(1).value))
  if (tResumoCli) {
    const resumo = lerResumoLinha(ctx, ws, tResumoCli, 'MANUT_EXTERNA', null, 'Clientes com mais chamados (contagem mensal)')
    for (const [comp, v] of resumo) {
      const calc = contagemClientes.get(comp) ?? 0
      ctx.total({ aba, celula: v.celula, descricao: `Quantidade de clientes listados em ${comp.slice(0, 7)}`, valorPlanilha: v.valor, valorCalculado: calc })
      ctx.referencias.push({ aba, serie: 'ME_CHAMADOS_CLIENTE (clientes listados)', competencia: comp, planilha: v.valor, celula: v.celula, consulta: { tipo: 'SERIE_CONTAGEM', serie: 'ME_CHAMADOS_CLIENTE' } })
    }
  }

  // Chamados desnecessários por cliente (detalhe)
  const tDesn = acharTitulos(ws, /CHAMADOS DESNECESSARIOS POR CLIENTE/)[0]
  const tEquip = acharTitulos(ws, /^MANUTENCAO EM EQUIPAMENTO DO CLIENTE/)
  const tEquipDet = tEquip.find((t) => /^MES$/.test(normalizarTexto(texto(ws.getRow(t.r + 1).getCell(1)) ?? '')))
  const tEquipRes = tEquip.find((t) => t !== tEquipDet && competenciaDeData(ws.getRow(t.r + 1).getCell(1).value))
  const detDesn = new Map<string, number>()
  if (tDesn) {
    ctx.consumirLinha(ws, tDesn.r)
    const blocos = blocosMes(ctx, ws, tDesn.r + 1, tDesn.r + 2, [
      ['fantasia', /^FANTASIA/], ['solicitante', /^SOLICITANTE/], ['motivo', /^MOTIVO/], ['solucao', /^SOLUCAO/],
    ])
    const limite = (tEquipDet?.r ?? ws.rowCount + 1) - 1
    const n = lerDetalhes(ctx, ws, blocos, tDesn.r + 3, limite, 'DESNECESSARIO', ['fantasia', 'solicitante', 'motivo', 'solucao'], detDesn)
    ctx.bloco(aba, 'Chamados desnecessários por cliente', 'historico_detalhe (DESNECESSARIO)', `A${tDesn.r}:${letraColuna(Math.max(...blocos.map((b) => b.cRotulo + 3)))}${limite}`, n)
    // Conferência com a série ME_DESNECESSARIOS (fontes diferentes: lista x contagem)
    for (const s of ctx.series.filter((x) => x.serie === 'ME_DESNECESSARIOS')) {
      const listados = detDesn.get(s.competencia) ?? 0
      if (listados !== s.valor) {
        ctx.pendencia({ aba, celula: s.celula, tipo: 'DIVERGENCIA_FONTE', descricao: `Chamados desnecessários em ${s.competencia.slice(0, 7)}: resumo ${s.valor} x ${listados} listados por cliente`, valorBruto: { resumo: s.valor, listados } })
      }
    }
  } else ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Bloco "Chamados desnecessários por cliente" não encontrado' })

  // Manutenção em equipamento do cliente (detalhe) + resumo
  const detEquip = new Map<string, number>()
  if (tEquipDet) {
    ctx.consumirLinha(ws, tEquipDet.r)
    const blocos = blocosMes(ctx, ws, tEquipDet.r + 1, tEquipDet.r + 2, [
      ['fantasia', /^FANTASIA/], ['solicitante', /^SOLICITANTE/], ['equipamento', /^(EQUIPAMENTO|MOTIVO)/], ['solucao', /^SOLUCAO/], ['valor', /^VALOR/],
    ])
    const limite = (tEquipRes?.r ?? ws.rowCount + 1) - 1
    const n = lerDetalhes(ctx, ws, blocos, tEquipDet.r + 3, limite, 'EQUIP_CLIENTE', ['fantasia', 'solicitante', 'equipamento', 'solucao', 'valor'], detEquip)
    ctx.bloco(aba, 'Manutenção em equipamento do cliente', 'historico_detalhe (EQUIP_CLIENTE)', `A${tEquipDet.r}:${letraColuna(Math.max(...blocos.map((b) => b.cRotulo + 4)))}${limite}`, n)
  } else ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Bloco "Manutenção em equipamento do cliente" não encontrado' })
  if (tEquipRes) {
    const resumo = lerResumoLinha(ctx, ws, tEquipRes, 'MANUT_EXTERNA', 'ME_EQUIP_CLIENTE_QTD', 'Manutenção em equipamento do cliente (quantidade)')
    for (const [comp, v] of resumo) {
      ctx.total({ aba, celula: v.celula, descricao: `Manutenções em equipamento do cliente listadas em ${comp.slice(0, 7)}`, valorPlanilha: v.valor, valorCalculado: detEquip.get(comp) ?? 0 })
      ctx.referencias.push({ aba, serie: 'EQUIP_CLIENTE (registros detalhados)', competencia: comp, planilha: v.valor, celula: v.celula, consulta: { tipo: 'DETALHE', detalhe: 'EQUIP_CLIENTE' } })
    }
  }

  // Trocas de equipamentos (tabela) + resumo
  const titulosTroca = acharTitulos(ws, /^TROCAS DE EQUIPAMENTOS SOLICITADAS/)
  const tResumoTroca = titulosTroca.find((t) => competenciaDeData(ws.getRow(t.r + 1).getCell(1).value))
  const tTabela = titulosTroca.find((t) => t !== tResumoTroca)
  const contTrocas = new Map<string, number>()
  if (tTabela) analisarTrocas(ctx, ws, tTabela.r, (tResumoTroca?.r ?? ws.rowCount + 1) - 1, contTrocas)
  else ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Tabela "Trocas de equipamentos solicitadas" não encontrada' })
  if (tResumoTroca) {
    const resumo = lerResumoLinha(ctx, ws, tResumoTroca, 'MANUT_EXTERNA', 'ME_TROCAS_QTD', 'Trocas de equipamentos solicitadas (quantidade)')
    for (const [comp, v] of resumo) {
      ctx.total({ aba, celula: v.celula, descricao: `Trocas listadas com solicitação em ${comp.slice(0, 7)}`, valorPlanilha: v.valor, valorCalculado: contTrocas.get(comp) ?? 0 })
      ctx.referencias.push({ aba, serie: 'solicitacao_troca (quantidade)', competencia: comp, planilha: v.valor, celula: v.celula, consulta: { tipo: 'TROCAS' } })
    }
    for (const [comp, n] of contTrocas) {
      if (!resumo.has(comp)) ctx.pendencia({ aba, celula: null, tipo: 'TOTAL_INCOMPATIVEL', descricao: `Trocas com solicitação em ${comp.slice(0, 7)} (${n}) sem quantidade no resumo mensal`, valorBruto: { listadas: n } })
    }
  }
}

function lerDetalhes(ctx: Contexto, ws: Worksheet, blocos: BlocoMes[], r0: number, r1: number, tipo: DetalheLinha['tipo'], campos: string[], contagem: Map<string, number>): number {
  let n = 0
  for (const b of blocos) {
    for (let r = r0; r <= r1; r++) {
      const dados: Record<string, string | number | null> = {}
      let algum = false
      let cMin = Infinity, cMax = 0
      for (const campo of campos) {
        const c = b.colunas.get(campo)
        if (!c) {
          dados[campo] = null
          continue
        }
        const cell = ws.getRow(r).getCell(c)
        if (vazia(cell)) {
          dados[campo] = null
          continue
        }
        algum = true
        cMin = Math.min(cMin, c)
        cMax = Math.max(cMax, c)
        ctx.consumir(ws.name, r, c)
        if (campo === 'valor') {
          const l = lerNumero(cell)
          if (l.tipo === 'numero') dados.valor = l.valor
          else {
            dados.valor = null
            dados.valor_bruto = texto(cell)
            ctx.pendencia({ aba: ws.name, celula: cell.address, tipo: 'VALOR_INVALIDO', descricao: 'Valor não numérico em manutenção de equipamento do cliente' })
          }
        } else dados[campo] = texto(cell)
      }
      if (!algum) continue
      if (!dados.fantasia) ctx.pendencia({ aba: ws.name, celula: endereco(r, b.colunas.get('fantasia') ?? b.cRotulo), tipo: 'VALOR_INVALIDO', descricao: 'Registro detalhado sem fantasia do cliente (importado mesmo assim)' })
      ctx.detalhes.push({ area: 'MANUT_EXTERNA', tipo, competencia: b.competencia, dados, aba: ws.name, faixa: `${letraColuna(cMin)}${r}:${letraColuna(cMax)}${r}` })
      contagem.set(b.competencia, (contagem.get(b.competencia) ?? 0) + 1)
      n++
    }
  }
  return n
}

function analisarTrocas(ctx: Contexto, ws: Worksheet, rTitulo: number, rLimite: number, cont: Map<string, number>) {
  const aba = ws.name
  ctx.consumirLinha(ws, rTitulo)
  let rh = 0
  for (let r = rTitulo + 1; r <= rTitulo + 4; r++) if (/^FANTASIA/.test(normalizarTexto(texto(ws.getRow(r).getCell(1)) ?? ''))) rh = r
  if (!rh) {
    ctx.pendencia({ aba, celula: endereco(rTitulo, 1), tipo: 'SEM_MAPEAMENTO', descricao: 'Cabeçalho da tabela de trocas não encontrado' })
    return
  }
  ctx.consumirLinha(ws, rh)
  const col = (re: RegExp) => colunaPorRotulo(ws, rh, re, 12)
  const cF = col(/^FANTASIA/) ?? 1, cS = col(/^DATA DA SOLICITACAO/) ?? 2, cT = col(/^DATA DA TROCA/) ?? 3
  const cP = col(/^SOLI.*POR/) ?? 4, cE = col(/^EQUIPAMENTO/) ?? 5, cL = col(/STAR|PADRAO/) ?? 6
  let n = 0
  let r = rh + 1
  for (; r <= rLimite; r++) {
    const row = ws.getRow(r)
    const cols = [cF, cS, cT, cP, cE, cL]
    if (cols.every((c) => vazia(row.getCell(c)))) break
    cols.forEach((c) => ctx.consumir(aba, r, c))
    const fantasia = texto(row.getCell(cF))
    const dSol = dataIso(row.getCell(cS).value)
    const bruto = { linha: r, fantasia, data_solicitacao: texto(row.getCell(cS)), data_troca: texto(row.getCell(cT)) }
    if (!fantasia || !dSol) {
      ctx.pendencia({ aba, celula: `A${r}:F${r}`, tipo: 'VALOR_INVALIDO', descricao: 'Troca sem cliente ou sem data de solicitação válida: não importada', valorBruto: bruto })
      continue
    }
    let dTroca = dataIso(row.getCell(cT).value)
    const tTroca = texto(row.getCell(cT))
    let observacao: string | null = null
    if (!dTroca && tTroca && !/^PENDENTE$/.test(normalizarTexto(tTroca))) {
      observacao = `Data da troca na planilha: ${tTroca}`
      ctx.pendencia({ aba, celula: endereco(r, cT), tipo: 'VALOR_INVALIDO', descricao: 'Data da troca não reconhecida: troca importada como PENDENTE', valorBruto: { texto: tTroca } })
    }
    if (dTroca && dTroca < dSol) {
      observacao = `Data da troca na planilha (${dTroca}) anterior à solicitação`
      ctx.pendencia({ aba, celula: endereco(r, cT), tipo: 'VALOR_INVALIDO', descricao: 'Data da troca anterior à solicitação: troca importada como PENDENTE', valorBruto: { data_troca: dTroca, data_solicitacao: dSol } })
      dTroca = null
    }
    const eq = texto(row.getCell(cE))
    if (eq) ctx.registrarFamilia(eq, `${aba}!${endereco(r, cE)}`, false)
    const linhaTxt = normalizarTexto(texto(row.getCell(cL)) ?? '')
    const linha = /STAR/.test(linhaTxt) ? 'STAR' : /PADR/.test(linhaTxt) ? 'PADRAO' : null
    if (linhaTxt && !linha) ctx.pendencia({ aba, celula: endereco(r, cL), tipo: 'VALOR_INVALIDO', descricao: 'Linha (Star/Padrão) não reconhecida', valorBruto: { texto: linhaTxt } })
    const comp = `${dSol.slice(0, 7)}-01`
    ctx.trocas.push({
      competencia: comp, clienteTexto: fantasia, dataSolicitacao: dSol, dataTroca: dTroca, status: dTroca ? 'CONCLUIDA' : 'PENDENTE',
      solicitadoPorTexto: texto(row.getCell(cP)), equipamentoTexto: eq, linha, observacao, aba, linhaPlanilha: r,
    })
    cont.set(comp, (cont.get(comp) ?? 0) + 1)
    n++
  }
  ctx.bloco(aba, 'Trocas de equipamentos solicitadas', 'solicitacao_troca', `A${rTitulo}:F${r - 1}`, n)
}

/* ------------------------------------------------------------------ */
/* Estoque de peças                                                    */
/* ------------------------------------------------------------------ */

function analisarEstoque(ctx: Contexto, ws: Worksheet) {
  lerMatriz(ctx, ws, { titulo: /^ENTRADA DE ESTOQUE/, area: 'ESTOQUE_PECAS', serie: 'EP_ENTRADA_RS', dimensao: 'FAMILIA_PECA', descricao: 'Entrada de estoque (R$)' })
  lerMatriz(ctx, ws, { titulo: /^SAIDA DE ESTOQUE/, area: 'ESTOQUE_PECAS', serie: 'EP_SAIDA_RS', dimensao: 'FAMILIA_PECA', descricao: 'Saída de estoque (R$)' })
  // Tabela dinâmica sem dados (esboço): ignorada com pendência informativa.
  const t = acharTitulos(ws, /ITENS RETIRADOS DE EQUIPAMENTOS/)[0]
  if (t) {
    let fim = t.r
    for (let r = t.r; r <= Math.min(ws.rowCount, t.r + 15); r++) {
      if (ws.getRow(r).cellCount) {
        ctx.consumirLinha(ws, r)
        fim = r
      }
    }
    ctx.pendencia({ aba: ws.name, celula: `A${t.r}:B${fim}`, tipo: 'INFORMATIVO', descricao: 'Esboço de tabela dinâmica ("Itens retirados de equipamentos") sem dados: ignorado' })
    ctx.bloco(ws.name, 'Itens retirados de equipamentos (tabela dinâmica)', 'ignorado (informativo)', `A${t.r}:B${fim}`, 0)
  }
}

/* ------------------------------------------------------------------ */
/* Entregas e retiradas de comodato                                    */
/* ------------------------------------------------------------------ */

function analisarEntregas(ctx: Contexto, ws: Worksheet) {
  const series = ['CO_ENTREGAS', 'CO_TROCAS', 'CO_RETIRADAS', 'CO_SEM_EXITO', 'CO_FIM_ANO']
  lerMatriz(ctx, ws, {
    titulo: /ENTREGAS E RETIRADAS COMODATO/, area: 'COMODATO', dimensao: null, descricao: 'Entregas e retiradas de comodato', seriesTotal: series,
    serie: (rot) => (/FINAL DE ANO/.test(rot) ? 'CO_FIM_ANO' : /^ENTREGAS?$/.test(rot) ? 'CO_ENTREGAS' : /^TROCAS?$/.test(rot) ? 'CO_TROCAS' : /^RETIRADAS?$/.test(rot) ? 'CO_RETIRADAS' : /^SEM EXITO$/.test(rot) ? 'CO_SEM_EXITO' : null),
  })
}

/* ------------------------------------------------------------------ */
/* Estoque de comodato (posições mensais)                              */
/* ------------------------------------------------------------------ */

const MESES_PT = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']

function competenciaDeTitulo(t: string): string | null {
  const n = normalizarTexto(t)
  const m = n.match(/(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*\/\s*(\d{2,4})/)
  if (!m) return null
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return `${ano}-${String(MESES_PT.indexOf(m[1]) + 1).padStart(2, '0')}-01`
}

function analisarEstoqueComodato(ctx: Contexto, ws: Worksheet) {
  const aba = ws.name
  const titulos = acharTitulos(ws, /^FINAL MES/, 4)
  const vistos = new Set<string>()
  const anteriores = new Map<string, { atual: number; linha: number }>()
  for (const t of titulos) {
    const comp = competenciaDeTitulo(t.texto)
    ctx.consumirLinha(ws, t.r)
    if (!comp) {
      ctx.pendencia({ aba, celula: endereco(t.r, t.c), tipo: 'VALOR_INVALIDO', descricao: 'Título de mês não reconhecido no estoque de comodato', valorBruto: { texto: t.texto } })
      continue
    }
    if (vistos.has(comp)) continue // título repetido na linha seguinte (mesclado)
    vistos.add(comp)
    let rh = 0
    for (let r = t.r + 1; r <= t.r + 4; r++) if (/^PRODUTO/.test(normalizarTexto(texto(ws.getRow(r).getCell(1)) ?? ''))) {
      rh = r
      break
    }
    if (!rh) {
      ctx.pendencia({ aba, celula: endereco(t.r, t.c), tipo: 'SEM_MAPEAMENTO', descricao: `Cabeçalho PRODUTO não encontrado para ${comp.slice(0, 7)}` })
      continue
    }
    ctx.consumirLinha(ws, rh)
    const col = (re: RegExp) => colunaPorRotulo(ws, rh, re, 16)
    const cols = {
      ant: col(/^ANT/), novos: col(/^NOVOS/), usados: col(/^USADOS/), atual: col(/^ATUAL/), manut: col(/^MANUTENCAO/),
      custoUsado: col(/^CUSTO USADO/), custoNovo: col(/^CUSTO NOVO/), ent: col(/^ENT/), sn: col(/^SAIDAS? NOVO/), su: col(/^SAIDAS? USADO/),
    }
    const linhasProd: number[] = []
    let r = rh + 1
    let registros = 0
    for (; r <= ws.rowCount; r++) {
      const prod = texto(ws.getRow(r).getCell(1))
      if (!prod) break
      linhasProd.push(r)
      ctx.consumirLinha(ws, r)
      const ler = (c: number | null) => (c ? lerNumero(ws.getRow(r).getCell(c)) : ({ tipo: 'vazio' } as LeituraNumero))
      const num = (c: number | null) => {
        const l = ler(c)
        return l.tipo === 'numero' ? l.valor : null
      }
      const obrig = { ant: num(cols.ant), novos: num(cols.novos), usados: num(cols.usados), ent: num(cols.ent), sn: num(cols.sn), su: num(cols.su) }
      const faltando = Object.entries(obrig).filter(([, v]) => v === null).map(([k]) => k)
      const negativos = Object.entries(obrig).filter(([, v]) => v !== null && v < 0).map(([k]) => k)
      if (faltando.length || negativos.length) {
        ctx.pendencia({ aba, celula: `A${r}:K${r}`, tipo: 'VALOR_INVALIDO', descricao: `Posição de comodato de "${prod}" em ${comp.slice(0, 7)} com campos ${faltando.length ? 'vazios/inválidos: ' + faltando.join(', ') : 'negativos: ' + negativos.join(', ')}; não importada`, valorBruto: obrig })
        continue
      }
      const o = obrig as Record<keyof typeof obrig, number>
      const atual = num(cols.atual)
      const movimento = o.ant + o.ent - o.sn - o.su
      const ajuste = o.novos + o.usados - movimento
      let justificativa: string | null = null
      if (ajuste !== 0) {
        justificativa = 'Diferença histórica da planilha (importação) — revisar'
        ctx.pendencia({ aba, celula: `A${r}:K${r}`, tipo: 'CONCILIACAO', descricao: `${prod.trim()} ${comp.slice(0, 7)}: Ant ${o.ant} + Ent ${o.ent} − Saída novo ${o.sn} − Saída usado ${o.su} = ${movimento}, mas Novos + Usados = ${o.novos + o.usados}; ajuste de ${ajuste} registrado`, valorBruto: { ...o, ajuste } })
      }
      if (atual !== null && atual !== o.novos + o.usados) {
        ctx.pendencia({ aba, celula: endereco(r, cols.atual!), tipo: 'CONCILIACAO', descricao: `${prod.trim()} ${comp.slice(0, 7)}: Atual ${atual} ≠ Novos + Usados ${o.novos + o.usados}`, valorBruto: { atual, novos: o.novos, usados: o.usados } })
      }
      const chaveProd = (() => {
        const res = resolverFamilia(prod, ctx.catalogo)
        return res.familia && (res.modo === 'NOME' || res.modo === 'ALIAS') ? `F:${res.familia}` : `P:${normalizarTexto(prod)}`
      })()
      const ant = anteriores.get(chaveProd)
      if (ant && ant.atual !== o.ant) {
        ctx.pendencia({ aba, celula: endereco(r, cols.ant!), tipo: 'CONCILIACAO', descricao: `${prod.trim()} ${comp.slice(0, 7)}: posição anterior ${o.ant} ≠ posição atual do mês anterior ${ant.atual} (linha ${ant.linha})`, valorBruto: { anterior_informado: o.ant, atual_mes_anterior: ant.atual } })
      }
      anteriores.set(chaveProd, { atual: atual ?? o.novos + o.usados, linha: r })
      ctx.registrarFamilia(prod, `${aba}!${endereco(r, 1)}`, true)
      ctx.posicoes.push({
        competencia: comp, produto: prod.trim(), posicaoAnterior: o.ant, entradas: o.ent, saidasNovos: o.sn, saidasUsados: o.su, novos: o.novos, usados: o.usados,
        atual, manutencaoInterna: num(cols.manut), custoTotalNovos: num(cols.custoNovo), custoTotalUsados: num(cols.custoUsado), ajuste, justificativaAjuste: justificativa, aba, linhaPlanilha: r,
      })
      registros++
    }
    // Linha de totais logo após os produtos (G = custo usados, H = custo novos)
    const rt = r
    for (const [c, campo, rotulo] of [[cols.custoUsado, 'custo_total_usados', 'Custo total usados'], [cols.custoNovo, 'custo_total_novos', 'Custo total novos']] as const) {
      if (!c) continue
      const cell = ws.getRow(rt).getCell(c)
      if (vazia(cell)) continue
      conferirAgregado(ctx, ws, cell, linhasProd.map((x) => endereco(x, c)), 'SOMA', `${rotulo} ${comp.slice(0, 7)}`)
      const l = lerNumero(cell)
      const v = l.tipo === 'numero' ? l.valor : l.tipo === 'formula' ? (cacheFormula(cell) as { ok: boolean; valor?: number }).valor ?? null : null
      if (v !== null) ctx.referencias.push({ aba, serie: `comodato_posicao.${campo}`, competencia: comp, planilha: arred(v, 2), celula: cell.address, consulta: { tipo: 'COMODATO', campo } })
    }
    if (ws.getRow(rt).cellCount) ctx.consumirLinha(ws, rt)
    const somaAtual = ctx.posicoes.filter((p) => p.competencia === comp).reduce((s, p) => s + p.novos + p.usados, 0)
    ctx.referencias.push({ aba, serie: 'comodato_posicao (novos + usados)', competencia: comp, planilha: somaAtual, celula: null, consulta: { tipo: 'COMODATO', campo: 'novos_usados' } })
    ctx.bloco(aba, `Estoque comodato ${comp.slice(0, 7)}`, 'comodato_posicao', `A${t.r}:K${rt}`, registros)
  }
  if (!titulos.length) ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Nenhum bloco "Final mês" encontrado' })
}

/* ------------------------------------------------------------------ */
/* T.I                                                                 */
/* ------------------------------------------------------------------ */

const STATUS_TI: [RegExp, ChamadoTiLinha['statusNormalizado']][] = [
  [/^(ENCERRADO|RESOLVIDO|ENCERRADO \/ RESOLVIDO|FECHADO|DONE|CONCLUIDO)$/, 'RESOLVIDO'],
  [/^(CANCELADO|CANCELED|CANCELLED|DUPLICATE|DUPLICADO)$/, 'CANCELADO'],
  [/^(ABERTO|NOVO|REABERTO|BACKLOG|TODO|TRIAGE)$/, 'ABERTO'],
  [/^(EM ATENDIMENTO|EM ANDAMENTO|IN PROGRESS|IN REVIEW)$/, 'EM_ATENDIMENTO'],
  [/^AGUARDANDO/, 'AGUARDANDO'],
  [/^ESCALADO/, 'ESCALADO'],
]

export function normalizarStatusTi(s: string): ChamadoTiLinha['statusNormalizado'] | null {
  const n = normalizarTexto(s)
  return STATUS_TI.find(([re]) => re.test(n))?.[1] ?? null
}

/** Chamado de teste: título "teste" ou "teste" seguido de caracteres aleatórios, sem espaços. */
export function ehChamadoTeste(titulo: string | null): boolean {
  if (!titulo) return false
  const n = normalizarTexto(titulo)
  return /^TESTE[A-Z0-9]*$/.test(n) || /^(TESTE|TEST)\s*\d*$/.test(n)
}

const CAMPOS_TI: [string, RegExp][] = [
  ['numero', /^NUMERO$/], ['titulo', /^TITULO$/], ['status', /^STATUS$/], ['tipo', /^TIPO$/], ['prioridade', /^PRIORIDADE$/],
  ['origem', /^ORIGEM$/], ['nivel', /^NIVEL/], ['categoria', /^CATEGORIA$/], ['subcategoria', /^SUBCATEGORIA$/], ['equipe', /^EQUIPE$/],
  ['tecnico', /^TECNICO RESPONSAVEL/], ['emailTecnico', /^E-?MAIL TECNICO/], ['solicitante', /^SOLICITANTE$/], ['emailSolicitante', /^E-?MAIL SOLICITANTE/],
  ['ramal', /^RAMAL/], ['setor', /^SETOR/], ['unidade', /^UNIDADE/], ['slaPrazo', /^SLA PRAZO/], ['slaViolado', /^SLA VIOLADO$/],
  ['slaVioladoEm', /^SLA VIOLADO EM/], ['slaPausadas', /^SLA HORAS PAUSADAS/], ['slaDesvio', /^SLA DESVIO/], ['solucao', /^SOLUCAO$/],
  ['causaRaiz', /^CAUSA RAIZ/], ['motivoCancelamento', /^MOTIVO CANCELAMENTO/], ['fechadoEm', /^FECHADO EM/], ['fechadoPor', /^FECHADO POR/],
  ['tempoResolucao', /^TEMPO DE RESOLUCAO/], ['escaladoEm', /^ESCALADO EM/], ['escaladoPor', /^ESCALADO POR/], ['csatNota', /^CSAT NOTA/],
  ['csatComentario', /^CSAT COMENTARIO/], ['csatRespondidoEm', /^CSAT RESPONDIDO/], ['tags', /^TAGS/], ['ip', /^IP ABERTURA/],
  ['abertura', /^ABERTURA$/], ['ultimaAtualizacao', /^ULTIMA ATUALIZACAO/], ['dataAbertura', /^DATA ABERTURA/],
]

function analisarTi(ctx: Contexto, ws: Worksheet) {
  const aba = ws.name
  let rh = 0
  for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) if (normalizarTexto(texto(ws.getRow(r).getCell(1)) ?? '') === 'NUMERO') {
    rh = r
    break
  }
  if (!rh) {
    ctx.pendencia({ aba, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: 'Cabeçalho da lista de chamados (Número) não encontrado' })
    return
  }
  ctx.consumirLinha(ws, rh)
  const col = new Map<string, number>()
  const cab = ws.getRow(rh)
  for (let c = 1; c <= cab.cellCount; c++) {
    const h = normalizarTexto(texto(cab.getCell(c)) ?? '')
    if (!h) continue
    const campo = CAMPOS_TI.find(([k, re]) => !col.has(k) && re.test(h))
    if (campo) col.set(campo[0], c)
    else ctx.pendencia({ aba, celula: endereco(rh, c), tipo: 'SEM_MAPEAMENTO', descricao: `Coluna "${texto(cab.getCell(c))}" da lista de chamados sem destino` })
  }
  for (const k of ['numero', 'status', 'abertura']) if (!col.has(k)) {
    ctx.pendencia({ aba, celula: endereco(rh, 1), tipo: 'SEM_MAPEAMENTO', descricao: `Coluna obrigatória "${k}" ausente na lista de chamados` })
    return
  }
  const vistos = new Set<string>()
  let registros = 0
  let ultima = rh
  for (let r = rh + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const g = (k: string) => (col.has(k) ? texto(row.getCell(col.get(k)!)) : null)
    const numero = g('numero')
    if (!numero) {
      if (row.cellCount && [...col.values()].some((c) => !vazia(row.getCell(c)))) {
        ctx.pendencia({ aba, celula: `A${r}`, tipo: 'VALOR_INVALIDO', descricao: 'Linha da lista de chamados sem número: não importada' })
        ctx.consumirLinha(ws, r)
      }
      continue
    }
    ultima = r
    ctx.consumirLinha(ws, r)
    const titulo = g('titulo')
    if (vistos.has(numero)) {
      ctx.pendencia({ aba, celula: `A${r}`, tipo: 'DUPLICIDADE', descricao: `Chamado ${numero} repetido: mantida a primeira ocorrência`, valorBruto: { numero, titulo } })
      continue
    }
    vistos.add(numero)
    const abertoEm = dataHoraSaoPaulo(g('abertura')) ?? (g('dataAbertura') ? dataHoraSaoPaulo(g('dataAbertura')) : null)
    if (!abertoEm) {
      ctx.pendencia({ aba, celula: endereco(r, col.get('abertura')!), tipo: 'VALOR_INVALIDO', descricao: `Chamado ${numero} sem data de abertura válida: não importado`, valorBruto: { numero, abertura: g('abertura') } })
      continue
    }
    const origem = g('origem')
    const sistemaOrigem: ChamadoTiLinha['sistemaOrigem'] = /^TI-/i.test(numero) ? 'TI' : /^SRL-/i.test(numero) || normalizarTexto(origem ?? '') === 'LINEAR' ? 'LINEAR' : 'OUTRO'
    if (sistemaOrigem === 'OUTRO') ctx.pendencia({ aba, celula: `A${r}`, tipo: 'SEM_MAPEAMENTO', descricao: `Chamado ${numero}: sistema de origem não identificado (importado como OUTRO)` })
    const status = g('status') ?? ''
    let sn = normalizarStatusTi(status)
    if (!sn) {
      ctx.pendencia({ aba, celula: endereco(r, col.get('status')!), tipo: 'SEM_MAPEAMENTO', descricao: `Status "${status}" sem correspondência (chamado ${numero} importado como ABERTO)` })
      sn = 'ABERTO'
    }
    const dh = (k: string) => {
      const v = g(k)
      if (!v) return null
      const d = dataHoraSaoPaulo(v)
      if (!d) ctx.pendencia({ aba, celula: endereco(r, col.get(k)!), tipo: 'VALOR_INVALIDO', descricao: `Data/hora não reconhecida no chamado ${numero}`, valorBruto: { numero, campo: k, texto: v } })
      return d
    }
    const horas = (k: string) => {
      if (!col.has(k)) return null
      const cell = row.getCell(col.get(k)!)
      if (vazia(cell)) return null
      const h = horasDeTexto(cell.value)
      if (h === null) ctx.pendencia({ aba, celula: cell.address, tipo: 'VALOR_INVALIDO', descricao: `Horas não reconhecidas no chamado ${numero}`, valorBruto: { numero, campo: k, texto: texto(cell) } })
      return h
    }
    let fechadoEm = dh('fechadoEm')
    if (fechadoEm && new Date(fechadoEm) < new Date(abertoEm)) {
      ctx.pendencia({ aba, celula: endereco(r, col.get('fechadoEm')!), tipo: 'VALOR_INVALIDO', descricao: `Chamado ${numero}: fechamento anterior à abertura (fechamento descartado)`, valorBruto: { numero } })
      fechadoEm = null
    }
    let pausadas = horas('slaPausadas')
    if (pausadas !== null && pausadas < 0) {
      ctx.pendencia({ aba, celula: endereco(r, col.get('slaPausadas')!), tipo: 'VALOR_INVALIDO', descricao: `Chamado ${numero}: horas pausadas negativas (descartadas)`, valorBruto: { numero, pausadas } })
      pausadas = null
    }
    const slaTxt = normalizarTexto(g('slaViolado') ?? '')
    const slaViolado = /^(SIM|S|TRUE|YES)$/.test(slaTxt) ? true : /^(NAO|N|FALSE|NO)$/.test(slaTxt) ? false : null
    if (slaTxt && slaViolado === null) ctx.pendencia({ aba, celula: endereco(r, col.get('slaViolado')!), tipo: 'VALOR_INVALIDO', descricao: `SLA violado com valor não reconhecido no chamado ${numero}` })
    let csat = horas('csatNota')
    if (csat !== null && (csat < 0 || csat > 5)) {
      ctx.pendencia({ aba, celula: endereco(r, col.get('csatNota')!), tipo: 'VALOR_INVALIDO', descricao: `CSAT fora de 0–5 no chamado ${numero} (descartado)` })
      csat = null
    }
    const tags = g('tags')?.split(/[,;]/).map((s) => s.trim()).filter(Boolean) ?? null
    const teste = ehChamadoTeste(titulo)
    if (teste) ctx.pendencia({ aba, celula: `A${r}`, tipo: 'DADO_TESTE', descricao: `Chamado ${numero} identificado como teste (título "${titulo}"): importado com dado_teste = verdadeiro`, valorBruto: { numero } })
    ctx.chamados.push({
      numero, sistemaOrigem, competencia: `${abertoEm.slice(0, 7)}-01`, titulo, status, statusNormalizado: sn,
      tipo: g('tipo'), prioridade: g('prioridade'), origemCanal: origem, nivelSuporte: g('nivel'), categoria: g('categoria'), subcategoria: g('subcategoria'),
      equipe: g('equipe'), tecnicoResponsavel: g('tecnico'), solicitante: g('solicitante'), departamento: g('setor'), unidadeTexto: g('unidade'),
      abertoEm, slaPrazo: dh('slaPrazo'), slaViolado, slaVioladoEm: dh('slaVioladoEm'), slaHorasPausadas: pausadas, slaDesvioH: horas('slaDesvio'),
      solucao: g('solucao'), causaRaiz: g('causaRaiz'), motivoCancelamento: g('motivoCancelamento'), fechadoEm, tempoResolucaoOrigemH: horas('tempoResolucao'),
      escaladoEm: dh('escaladoEm'), csatNota: csat, csatComentario: g('csatComentario'), csatRespondidoEm: dh('csatRespondidoEm'), tags: tags?.length ? tags : null,
      ultimaAtualizacaoEm: dh('ultimaAtualizacao'), dadoTeste: teste, aba, linhaPlanilha: r,
      restrito: { emailTecnico: g('emailTecnico'), emailSolicitante: g('emailSolicitante'), ramal: g('ramal'), ipAbertura: g('ip'), fechadoPorEmail: g('fechadoPor'), escaladoPorEmail: g('escaladoPor') },
    })
    registros++
  }
  ctx.bloco(aba, 'Lista de chamados', 'chamado_ti (+ chamado_ti_restrito)', `A${rh}:${letraColuna(cab.cellCount)}${ultima}`, registros)

  // Quadro-resumo (somente conferência)
  const ti = ctx.chamados.filter((c) => c.sistemaOrigem === 'TI')
  // O quadro da planilha calcula o tempo médio somente sobre chamados TI resolvidos.
  const tempos = ti.filter((c) => c.statusNormalizado === 'RESOLVIDO').map((c) => c.tempoResolucaoOrigemH).filter((x): x is number => x !== null)
  const metricas: [RegExp, string, ConsultaSistema & { tipo: 'TI' }, number, number][] = [
    [/^CHAMADOS TI$/, 'Chamados TI', { tipo: 'TI', metrica: 'TI' }, ti.length, 0],
    [/^CHAMADOS LINEAR/, 'Chamados Linear', { tipo: 'TI', metrica: 'LINEAR' }, ctx.chamados.filter((c) => c.sistemaOrigem === 'LINEAR').length, 0],
    [/^TOTAL EXPORTADO/, 'Total exportado', { tipo: 'TI', metrica: 'TOTAL' }, ctx.chamados.length, 0],
    [/^EM ABERTO/, 'Em aberto (TI)', { tipo: 'TI', metrica: 'ABERTOS_TI' }, ti.filter((c) => !['RESOLVIDO', 'CANCELADO'].includes(c.statusNormalizado)).length, 0],
    [/^ENCERRADOS/, 'Encerrados/resolvidos (TI)', { tipo: 'TI', metrica: 'RESOLVIDOS_TI' }, ti.filter((c) => c.statusNormalizado === 'RESOLVIDO').length, 0],
    [/^CANCELADOS/, 'Cancelados (TI)', { tipo: 'TI', metrica: 'CANCELADOS_TI' }, ti.filter((c) => c.statusNormalizado === 'CANCELADO').length, 0],
    [/EXCEDIDO/, 'SLA excedido (TI)', { tipo: 'TI', metrica: 'SLA_VIOLADO_TI' }, ti.filter((c) => c.slaViolado === true).length, 0],
    [/^TEMPO MEDIO/, 'Tempo médio de resolução (h, TI resolvidos)', { tipo: 'TI', metrica: 'TEMPO_MEDIO_TI' }, tempos.length ? tempos.reduce((s, x) => s + x, 0) / tempos.length : 0, 1],
  ]
  for (let r = 1; r < rh; r++) {
    const rot = texto(ws.getRow(r).getCell(1))
    if (!rot) continue
    const m = metricas.find(([re]) => re.test(normalizarTexto(rot)))
    if (!m) {
      if (/RELATORIO DE CHAMADOS/.test(normalizarTexto(rot))) {
        ctx.consumir(aba, r, 1)
        ctx.consumir(aba, r, 2)
      }
      continue
    }
    const cell = ws.getRow(r).getCell(2)
    ctx.consumir(aba, r, 1)
    ctx.consumir(aba, r, 2)
    const l = lerNumero(cell)
    const v = l.tipo === 'numero' ? l.valor : l.tipo === 'formula' ? ((cacheFormula(cell) as { valor?: number }).valor ?? null) : null
    const [, desc, consulta, calc, casas] = m
    const calcArred = casas ? Math.round(calc * 10 ** casas) / 10 ** casas : calc
    ctx.total({ aba, celula: cell.address, descricao: `Quadro-resumo: ${desc}`, valorPlanilha: v, valorCalculado: calcArred, confere: v !== null && Math.abs(v - calcArred) <= (casas ? 0.05 : TOLERANCIA) })
    if (v !== null) ctx.referencias.push({ aba, serie: `chamado_ti: ${desc}`, competencia: null, planilha: v, celula: cell.address, consulta })
  }
  ctx.bloco(aba, 'Quadro-resumo de chamados', 'conferência (não importado)', `A1:B${rh - 1}`, 0)
}

/* ------------------------------------------------------------------ */
/* Conteúdo não mapeado                                                */
/* ------------------------------------------------------------------ */

const ANOTACAO = /(FORMULA NAO DIGITAR|NAO DIGITAR FORMULA|NAO DIGITAR|QUEM FAZ|\bFAZ\b|\bDIGITA\b)/

function naoMapeados(ctx: Contexto, ws: Worksheet) {
  const cons = ctx.consumidas.get(ws.name) ?? new Set<string>()
  const pendentes: { r: number; c: number; v: string }[] = []
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (ehEscravoMesclado(cell) || vazia(cell) || cons.has(cell.address)) return
      const t = texto(cell) ?? (ehFormula(cell.value) ? `=${cell.formula}` : '')
      if (ANOTACAO.test(normalizarTexto(t))) return
      pendentes.push({ r, c, v: t.slice(0, 80) })
    })
  })
  // Agrupa em regiões de linhas contíguas (tolerância de 1 linha vazia).
  const grupos: { r0: number; r1: number; c0: number; c1: number; cel: { r: number; c: number; v: string }[] }[] = []
  for (const p of pendentes.sort((a, b) => a.r - b.r || a.c - b.c)) {
    const g = grupos[grupos.length - 1]
    if (g && p.r - g.r1 <= 2) {
      g.r1 = Math.max(g.r1, p.r)
      g.c0 = Math.min(g.c0, p.c)
      g.c1 = Math.max(g.c1, p.c)
      g.cel.push(p)
    } else grupos.push({ r0: p.r, r1: p.r, c0: p.c, c1: p.c, cel: [p] })
  }
  for (const g of grupos) {
    const faixa = `${endereco(g.r0, g.c0)}:${endereco(g.r1, g.c1)}`
    ctx.pendencia({
      aba: ws.name, celula: faixa, tipo: 'SEM_MAPEAMENTO', descricao: `Conteúdo sem mapeamento (${g.cel.length} célula(s)) preservado nesta pendência`,
      valorBruto: { celulas: Object.fromEntries(g.cel.slice(0, 100).map((x) => [endereco(x.r, x.c), x.v])) },
    })
  }
}

/* ------------------------------------------------------------------ */
/* Propostas de mapeamento de famílias                                 */
/* ------------------------------------------------------------------ */

function montarPropostas(ctx: Contexto): { propostas: PropostaMapeamento[]; resolvidas: Record<string, string> } {
  const propostas: PropostaMapeamento[] = []
  const resolvidas: Record<string, string> = {}
  for (const [chave, info] of ctx.textosFamilia) {
    const r = resolverFamilia(chave, ctx.catalogo)
    if (r.familia && (r.modo === 'NOME' || r.modo === 'ALIAS')) {
      resolvidas[chave] = r.familia
      continue
    }
    let proposta: PropostaMapeamento
    if (r.modo === 'HEURISTICA') {
      proposta = { chave, entidade: 'FAMILIA_EQUIPAMENTO', textoOriginal: info.original, sugestao: r.familia, acao: 'ALIAS', criarAlias: info.rotulo, motivo: `Texto "${info.original}" não é nome nem sinônimo cadastrado; parece pertencer a ${r.familia}`, ocorrencias: info.ocorrencias }
    } else if (r.modo === 'AMBIGUO' || !info.rotulo) {
      proposta = { chave, entidade: 'FAMILIA_EQUIPAMENTO', textoOriginal: info.original, sugestao: null, acao: 'MANUAL', criarAlias: false, motivo: r.modo === 'AMBIGUO' ? `Texto "${info.original}" cita mais de uma família: família fica em branco` : `Texto "${info.original}" sem família reconhecível`, ocorrencias: info.ocorrencias }
    } else {
      proposta = { chave, entidade: 'FAMILIA_EQUIPAMENTO', textoOriginal: info.original, sugestao: null, acao: 'NOVA_FAMILIA', criarAlias: false, motivo: `Família "${info.original}" inexistente no cadastro: propor criação`, ocorrencias: info.ocorrencias }
    }
    propostas.push(proposta)
    const [aba, celula] = info.ocorrencias[0].split('!')
    ctx.pendencia({
      aba, celula: celula ?? null, tipo: 'SEM_MAPEAMENTO',
      descricao: `Família de equipamento "${info.original}": ${proposta.acao === 'ALIAS' ? `proposto mapear para ${proposta.sugestao}` : proposta.acao === 'NOVA_FAMILIA' ? 'proposta nova família' : 'mapeamento manual necessário'} (${info.ocorrencias.length} ocorrência(s))`,
      valorBruto: { proposta: chave, ocorrencias: info.ocorrencias.slice(0, 50) },
    })
  }
  return { propostas: propostas.sort((a, b) => a.chave.localeCompare(b.chave)), resolvidas }
}

/* ------------------------------------------------------------------ */
/* Entrada principal                                                   */
/* ------------------------------------------------------------------ */

const ANALISADORES: [string, (ctx: Contexto, ws: Worksheet) => void][] = [
  [ABAS.interna, analisarInterna],
  [ABAS.externa, analisarExterna],
  [ABAS.estoque, analisarEstoque],
  [ABAS.entregas, analisarEntregas],
  [ABAS.estoqueComodato, analisarEstoqueComodato],
  [ABAS.ti, analisarTi],
]

export async function analisarPlanilha(buffer: Buffer, nomeArquivo: string, catalogo: FamiliaCatalogo[] = CATALOGO_FAMILIAS_PADRAO): Promise<AnalisePlanilha> {
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ctx = new Contexto(catalogo)
  const usadas = new Set<string>()
  for (const [nome, fn] of ANALISADORES) {
    const ws = wb.worksheets.find((w) => normalizarTexto(w.name) === normalizarTexto(nome))
    if (!ws) {
      ctx.pendencia({ aba: nome, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: `Aba "${nome}" não encontrada no arquivo` })
      continue
    }
    usadas.add(ws.name)
    fn(ctx, ws)
    naoMapeados(ctx, ws)
  }
  for (const ws of wb.worksheets) {
    if (usadas.has(ws.name) || ws.state === 'veryHidden') continue
    if (ws.actualRowCount > 0) ctx.pendencia({ aba: ws.name, celula: null, tipo: 'SEM_MAPEAMENTO', descricao: `Aba "${ws.name}" sem mapeamento: conteúdo não importado` })
  }
  // Referências de reconciliação: soma das células por série/competência.
  const somas = new Map<string, { aba: string; valor: number; serie: string; competencia: string }>()
  for (const s of ctx.series) {
    const k = `${s.serie}|${s.competencia}`
    const e = somas.get(k)
    if (e) e.valor += s.valor
    else somas.set(k, { aba: s.aba, valor: s.valor, serie: s.serie, competencia: s.competencia })
  }
  for (const s of somas.values()) ctx.referencias.push({ aba: s.aba, serie: s.serie, competencia: s.competencia, planilha: arred(s.valor), celula: null, consulta: { tipo: 'SERIE_SOMA', series: [s.serie] } })
  const { propostas, resolvidas } = montarPropostas(ctx)
  return {
    arquivo: { nome: nomeArquivo, sha256, tamanho: buffer.length },
    abas: [...ctx.abas.values()],
    series: ctx.series,
    detalhes: ctx.detalhes,
    trocas: ctx.trocas,
    posicoesComodato: ctx.posicoes,
    chamadosTi: ctx.chamados,
    propostasMapeamento: propostas,
    pendencias: ctx.pendencias,
    totaisConferidos: ctx.totais,
    referencias: ctx.referencias,
    familiasResolvidas: resolvidas,
  }
}

/** Resumo sem dados pessoais (gravado em importacao.resumo e exibido na tela/CLI). */
export function resumoAnalise(a: AnalisePlanilha) {
  const porSerie: Record<string, { linhas: number; soma: number }> = {}
  for (const s of a.series) {
    const e = (porSerie[s.serie] ??= { linhas: 0, soma: 0 })
    e.linhas++
    e.soma = arred(e.soma + s.valor)
  }
  const porTipoPendencia: Record<string, number> = {}
  for (const p of a.pendencias) porTipoPendencia[p.tipo] = (porTipoPendencia[p.tipo] ?? 0) + 1
  const detalhes: Record<string, number> = {}
  for (const d of a.detalhes) detalhes[d.tipo] = (detalhes[d.tipo] ?? 0) + 1
  return {
    arquivo: a.arquivo,
    abas: a.abas,
    series: porSerie,
    detalhes,
    trocas: a.trocas.length,
    posicoesComodato: a.posicoesComodato.length,
    chamadosTi: {
      total: a.chamadosTi.length,
      ti: a.chamadosTi.filter((c) => c.sistemaOrigem === 'TI').length,
      linear: a.chamadosTi.filter((c) => c.sistemaOrigem === 'LINEAR').length,
      outros: a.chamadosTi.filter((c) => c.sistemaOrigem === 'OUTRO').length,
      teste: a.chamadosTi.filter((c) => c.dadoTeste).length,
    },
    pendencias: porTipoPendencia,
    totaisConferidos: a.totaisConferidos,
    totaisDivergentes: a.totaisConferidos.filter((t) => !t.confere).length,
    propostasMapeamento: a.propostasMapeamento,
    familiasResolvidas: a.familiasResolvidas,
    referencias: a.referencias,
  }
}
export type ResumoAnalise = ReturnType<typeof resumoAnalise>
