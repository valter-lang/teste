import { z } from 'zod'
import { TZDate } from '@date-fns/tz'

/**
 * Blocos de validação compartilhados por formulário, edição em grade e "colar linhas".
 * Todas as entradas chegam como texto (FormData, grade ou planilha colada) e são
 * convertidas aqui; ausência vira null (nunca zero).
 */
export const FUSO = 'America/Sao_Paulo'

/** Valores digitados, por nome de campo (sempre texto). */
export type Entrada = Record<string, string | undefined>

export class ErroCampo extends Error {}
const falha = (m: string): never => {
  throw new ErroCampo(m)
}

export function vazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/** Remove acentos, caixa e separadores (para casar rótulos colados do Excel). */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/* ------------------------------------------------------------------ */
/* Conversores (lançam ErroCampo)                                      */
/* ------------------------------------------------------------------ */

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 10,00". */
export function numeroBr(s: string): number {
  let t = s.replace(/\s|R\$|%/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(t)) t = t.replace(/\./g, '')
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) falha('Número inválido')
  return Number(t)
}

function dataValida(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
const p2 = (n: number) => String(n).padStart(2, '0')

function partesData(s: string): [number, number, number] | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return [y, Number(m[2]), Number(m[1])]
  }
  return null
}

/** Data -> 'YYYY-MM-DD'. Aceita ISO e dd/mm/aaaa. */
export function dataIso(s: string): string {
  const p = partesData(s.trim())
  if (!p || !dataValida(...p)) falha('Data inválida (use dd/mm/aaaa)')
  const [y, m, d] = p!
  if (y < 2000 || y > 2100) falha('Ano fora do intervalo aceito')
  return `${y}-${p2(m)}-${p2(d)}`
}

/**
 * Data e hora local (America/Sao_Paulo) -> ISO com deslocamento
 * ('2026-09-01T08:30:00.000-03:00'); os 10 primeiros caracteres são a data local.
 */
export function dataHoraIso(s: string): string {
  const t = s.trim()
  const m = /^(.+?)(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t)
  if (!m) falha('Data e hora inválidas')
  const p = partesData(m![1])
  if (!p || !dataValida(...p)) falha('Data e hora inválidas (use dd/mm/aaaa hh:mm)')
  const [y, mo, d] = p!
  if (y < 2000 || y > 2100) falha('Ano fora do intervalo aceito')
  const h = Number(m![2] ?? 0), mi = Number(m![3] ?? 0), se = Number(m![4] ?? 0)
  if (h > 23 || mi > 59 || se > 59) falha('Hora inválida')
  return new TZDate(y, mo - 1, d, h, mi, se, FUSO).toISOString()
}

/** Instante (Date/ISO) -> 'YYYY-MM-DDTHH:mm' no fuso oficial (valor de datetime-local). */
export function paraDataHoraLocal(v: Date | string | null | undefined): string {
  if (!v) return ''
  const d = new TZDate(new Date(v).getTime(), FUSO)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** Data local (YYYY-MM-DD) de um instante ISO com deslocamento ou Date. */
export function dataLocalDe(v: Date | string): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && /[+-]\d{2}:\d{2}$/.test(v)) return v.slice(0, 10)
  return paraDataHoraLocal(v).slice(0, 10)
}

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/** Competência -> 'YYYY-MM-01'. Aceita 2026-07, 2026-07-01, 07/2026, jul/26, 01/07/2026. */
export function competenciaIso(s: string): string {
  const t = s.trim()
  let m = /^(\d{4})-(\d{1,2})(?:-01)?$/.exec(t)
  let y: number | undefined, mo: number | undefined
  if (m) { y = Number(m[1]); mo = Number(m[2]) }
  else if ((m = /^(\d{1,2})\/(\d{4})$/.exec(t))) { y = Number(m[2]); mo = Number(m[1]) }
  else if ((m = /^([A-Za-zçÇ]{3})[a-zç]*[/\-. ](\d{2}|\d{4})$/.exec(t))) {
    mo = MESES_ABREV.indexOf(normalizar(m[1])) + 1
    y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  } else if (partesData(t)) {
    const d = dataIso(t)
    y = Number(d.slice(0, 4)); mo = Number(d.slice(5, 7))
  }
  if (!y || !mo || mo < 1 || mo > 12 || y < 2000 || y > 2100) falha('Competência inválida (use mm/aaaa)')
  return `${y}-${p2(mo!)}-01`
}

const VERDADEIRO = new Set(['TRUE', '1', 'SIM', 'S', 'X', 'YES', 'Y', 'VERDADEIRO', 'V'])
const FALSO = new Set(['FALSE', '0', 'NAO', 'N', 'NO', 'FALSO', 'F'])
export function booleano(s: string): boolean {
  const n = normalizar(s)
  if (VERDADEIRO.has(n)) return true
  if (FALSO.has(n)) return false
  return falha('Use Sim ou Não')
}

/** Aceita o código ('SUCATEADO') ou o rótulo ('Sucateado'), sem acento/caixa. */
export function valorEnum<V extends string>(valores: readonly V[], rotulos?: Partial<Record<V, string>>) {
  return (s: string): V => {
    const n = normalizar(s)
    const achado = valores.find((v) => normalizar(v) === n || (rotulos?.[v] && normalizar(rotulos[v]!) === n))
    if (!achado) falha(`Valor não aceito. Opções: ${valores.map((v) => rotulos?.[v] ?? v).join(', ')}`)
    return achado!
  }
}

/* ------------------------------------------------------------------ */
/* Construtores de schema                                              */
/* ------------------------------------------------------------------ */

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : String(v))

export function opcional<T>(conv: (s: string) => T) {
  return z.unknown().optional().transform((v, ctx): T | null => {
    if (vazio(v)) return null
    try {
      return conv(texto(v))
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof ErroCampo ? e.message : 'Valor inválido' })
      return z.NEVER
    }
  })
}

export function obrigatorio<T>(conv: (s: string) => T, padrao?: T) {
  return z.unknown().optional().transform((v, ctx): T => {
    if (vazio(v)) {
      if (padrao !== undefined) return padrao
      ctx.addIssue({ code: 'custom', message: 'Campo obrigatório' })
      return z.NEVER
    }
    try {
      return conv(texto(v))
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof ErroCampo ? e.message : 'Valor inválido' })
      return z.NEVER
    }
  })
}

const limitarTexto = (max: number) => (s: string) => (s.length > max ? falha(`Máximo de ${max} caracteres`) : s)

function numeroFaixa(o: { min?: number; max?: number; inteiro?: boolean }) {
  return (s: string) => {
    const n = numeroBr(s)
    if (o.inteiro && !Number.isInteger(n)) falha('Informe um número inteiro')
    if (o.min !== undefined && n < o.min) falha(o.min === 0 ? 'Não pode ser negativo' : `Mínimo ${o.min}`)
    if (o.max !== undefined && n > o.max) falha(`Máximo ${o.max}`)
    return n
  }
}

function idCadastro(s: string): number {
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) falha('Selecione um cadastro válido')
  return n
}

function listaTags(s: string): string[] {
  return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
}

function email(s: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) falha('E-mail inválido')
  return s.toLowerCase()
}

/** Atalhos: *Opc = pode ficar vazio (null); *Obr = obrigatório (com padrão opcional). */
export const v = {
  txtOpc: (max = 4000) => opcional(limitarTexto(max)),
  txtObr: (max = 4000) => obrigatorio(limitarTexto(max)),
  intOpc: (o: { min?: number; max?: number } = { min: 0 }) => opcional(numeroFaixa({ ...o, inteiro: true })),
  intObr: (o: { min?: number; max?: number } = { min: 0 }, padrao?: number) => obrigatorio(numeroFaixa({ ...o, inteiro: true }), padrao),
  decOpc: (o: { min?: number; max?: number } = { min: 0 }) => opcional(numeroFaixa(o)),
  decObr: (o: { min?: number; max?: number } = { min: 0 }, padrao?: number) => obrigatorio(numeroFaixa(o), padrao),
  dataOpc: () => opcional(dataIso),
  dataObr: () => obrigatorio(dataIso),
  dhOpc: () => opcional(dataHoraIso),
  dhObr: () => obrigatorio(dataHoraIso),
  compOpc: () => opcional(competenciaIso),
  boolOpc: () => opcional(booleano),
  boolObr: (padrao?: boolean) => obrigatorio(booleano, padrao),
  refOpc: () => opcional(idCadastro),
  refObr: () => obrigatorio(idCadastro),
  tags: () => opcional(listaTags),
  emailOpc: () => opcional(email),
  enumOpc: <V extends string>(valores: readonly V[], rotulos?: Partial<Record<V, string>>) => opcional(valorEnum(valores, rotulos)),
  enumObr: <V extends string>(valores: readonly V[], rotulos?: Partial<Record<V, string>>, padrao?: V) =>
    obrigatorio(valorEnum(valores, rotulos), padrao),
}

/* ------------------------------------------------------------------ */
/* Regras cruzadas                                                     */
/* ------------------------------------------------------------------ */

type Ctx = z.RefinementCtx
export const erro = (ctx: Ctx, campo: string, message: string) => ctx.addIssue({ code: 'custom', path: [campo], message })

const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`

/**
 * Deriva a competência da data do evento quando vazia; quando informada e `exigirMesmoMes`,
 * exige que corresponda ao mês da data. Retorna a competência final (ou null com erro).
 */
export function resolverCompetencia(
  ctx: Ctx, competencia: string | null, dataEvento: string | null | undefined, rotuloData: string, exigirMesmoMes = true,
): string {
  const doEvento = dataEvento ? `${dataEvento.slice(0, 7)}-01` : null
  if (!competencia) {
    if (doEvento) return doEvento
    erro(ctx, 'competencia', 'Informe a competência')
    return ''
  }
  if (exigirMesmoMes && doEvento && doEvento !== competencia) {
    erro(ctx, 'competencia', `A competência (${mesAno(competencia)}) deve corresponder ao mês da ${rotuloData} (${mesAno(doEvento)}).`)
  }
  return competencia
}

/** Garante a <= b (datas ISO ou instantes com deslocamento). Erro vai para o campo de b. */
export function ordem(ctx: Ctx, a: string | null | undefined, b: string | null | undefined, campoB: string, msg: string) {
  if (a && b && Date.parse(b) < Date.parse(a)) erro(ctx, campoB, msg)
}

/** Converte issues do zod em { campo: primeira mensagem }; '_' para erros gerais. */
export function errosPorCampo(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of issues) {
    const k = i.path.length ? String(i.path[0]) : '_'
    if (!out[k]) out[k] = i.message
  }
  return out
}

/** Data de hoje (YYYY-MM-DD) no fuso oficial. */
export function hojeLocal(agora = new Date()): string {
  return paraDataHoraLocal(agora).slice(0, 10)
}
