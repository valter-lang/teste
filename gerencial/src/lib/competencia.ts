/** Utilitários de competência (sempre 'YYYY-MM-01'). */
export function competenciaDe(isoData: string): string {
  return `${isoData.slice(0, 7)}-01`
}
export function validarCompetencia(c: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(c)
}
export function somarMeses(c: string, n: number): string {
  const [y, m] = c.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  const ny = Math.floor(t / 12)
  const nm = (t % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}
export function ultimoDia(c: string): string {
  const [y, m] = c.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${c.slice(0, 7)}-${String(d).padStart(2, '0')}`
}
export type Escopo = 'MES' | 'TRIMESTRE' | 'SEMESTRE' | 'ANO'
/** Meses (competências) do escopo que termina na competência de referência (acumulado até ela). */
export function mesesDoEscopo(ref: string, escopo: Escopo): string[] {
  const [y, m] = ref.split('-').map(Number)
  let inicio: number
  if (escopo === 'MES') inicio = m
  else if (escopo === 'TRIMESTRE') inicio = Math.floor((m - 1) / 3) * 3 + 1
  else if (escopo === 'SEMESTRE') inicio = m <= 6 ? 1 : 7
  else inicio = 1
  const out: string[] = []
  for (let k = inicio; k <= m; k++) out.push(`${y}-${String(k).padStart(2, '0')}-01`)
  return out
}
export function inicioEscopo(ref: string, escopo: Escopo) {
  return mesesDoEscopo(ref, escopo)[0]
}
export function rotuloEscopo(ref: string, escopo: Escopo): string {
  const [y, m] = ref.split('-').map(Number)
  if (escopo === 'MES') return `${String(m).padStart(2, '0')}/${y}`
  if (escopo === 'TRIMESTRE') return `${Math.floor((m - 1) / 3) + 1}º tri/${y}`
  if (escopo === 'SEMESTRE') return `${m <= 6 ? 1 : 2}º sem/${y}`
  return `Acumulado ${y}`
}
/** Competência atual em America/Sao_Paulo. */
export function competenciaAtual(agora = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(agora)
  return `${s}-01`
}
