/** Formatação pt-BR. Valores ausentes nunca viram zero: exibem "não informado". */
export const NAO_INFORMADO = 'Não informado'
export const NAO_APLICAVEL = 'N/A'

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })

export function numero(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NAO_INFORMADO
  return nf(casas, casas).format(v)
}

export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NAO_INFORMADO
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function percentual(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NAO_INFORMADO
  return `${nf(casas, casas).format(v)}%`
}

/** Formata conforme a unidade de medida do indicador. */
export function valorIndicador(v: number | null | undefined, unidade: string, casas = 1): string {
  if (v === null || v === undefined) return NAO_INFORMADO
  switch (unidade) {
    case '%':
      return percentual(v, casas)
    case 'R$':
      return moeda(v)
    case 'h':
      return `${numero(v, casas)} h`
    case 'h úteis':
      return `${numero(v, casas)} h úteis`
    case 'qtd':
      return numero(v, 0)
    default:
      return `${numero(v, casas)} ${unidade}`.trim()
  }
}

export function variacao(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NAO_APLICAVEL
  const s = nf(casas, casas).format(Math.abs(v))
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa' (sem conversão de fuso). */
export function data(iso: string | null | undefined): string {
  if (!iso) return NAO_INFORMADO
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const FMT_DH = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
export function dataHora(v: Date | string | null | undefined): string {
  if (!v) return NAO_INFORMADO
  return FMT_DH.format(typeof v === 'string' ? new Date(v) : v)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** '2026-07-01' -> 'jul/26' */
export function competenciaCurta(c: string): string {
  const [y, m] = c.split('-')
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`
}
/** '2026-07-01' -> 'julho/2026' */
export function competenciaLonga(c: string): string {
  const [y, m] = c.split('-')
  return `${MESES_LONGOS[Number(m) - 1]}/${y}`
}
/** '2026-07-01' -> '2026-07' (nomes de arquivo) */
export const competenciaArquivo = (c: string) => c.slice(0, 7)
