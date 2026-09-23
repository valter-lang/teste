import { TZDate } from '@date-fns/tz'

/**
 * Cálculo de horas úteis com o calendário oficial (feriados + expediente),
 * no fuso America/Sao_Paulo. Pausas só são descontadas quando válidas pela
 * política de SLA (quem chama decide quais pausas são válidas).
 */
export interface Calendario {
  fuso: string
  /** Dias da semana úteis: 0=domingo ... 6=sábado */
  diasUteis: number[]
  /** 'HH:MM' */
  inicio: string
  fim: string
  /** 'YYYY-MM-DD' */
  feriados: Set<string>
}

export const CALENDARIO_PADRAO: Calendario = {
  fuso: 'America/Sao_Paulo',
  diasUteis: [1, 2, 3, 4, 5],
  inicio: '08:00',
  fim: '18:00',
  feriados: new Set(),
}

const HMS = (s: string) => s.split(':').map(Number) as [number, number]

function janelaDoDia(y: number, m: number, d: number, cal: Calendario): [number, number] | null {
  const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dow = new TZDate(y, m, d, 12, 0, cal.fuso).getDay()
  if (!cal.diasUteis.includes(dow) || cal.feriados.has(iso)) return null
  const [hi, mi] = HMS(cal.inicio)
  const [hf, mf] = HMS(cal.fim)
  return [new TZDate(y, m, d, hi, mi, cal.fuso).getTime(), new TZDate(y, m, d, hf, mf, cal.fuso).getTime()]
}

/** Itera dias locais entre dois instantes. */
function* diasLocais(inicio: number, fim: number, cal: Calendario) {
  const a = new TZDate(inicio, cal.fuso)
  let y = a.getFullYear(), m = a.getMonth(), d = a.getDate()
  for (let guard = 0; guard < 3700; guard++) {
    const meiaNoite = new TZDate(y, m, d, 0, 0, cal.fuso).getTime()
    if (meiaNoite > fim) return
    yield [y, m, d] as const
    const prox = new TZDate(y, m, d + 1, 12, 0, cal.fuso)
    y = prox.getFullYear(); m = prox.getMonth(); d = prox.getDate()
  }
}

/** Milissegundos úteis dentro de [inicio, fim]. */
function msUteis(inicio: number, fim: number, cal: Calendario): number {
  if (fim <= inicio) return 0
  let total = 0
  for (const [y, m, d] of diasLocais(inicio, fim, cal)) {
    const j = janelaDoDia(y, m, d, cal)
    if (!j) continue
    const a = Math.max(inicio, j[0])
    const b = Math.min(fim, j[1])
    if (b > a) total += b - a
  }
  return total
}

function mesclar(intervalos: [number, number][]): [number, number][] {
  const s = intervalos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const it of s) {
    const last = out[out.length - 1]
    if (last && it[0] <= last[1]) last[1] = Math.max(last[1], it[1])
    else out.push([...it])
  }
  return out
}

/** Horas úteis entre dois instantes, descontando pausas válidas (sobreposição com o intervalo). */
export function horasUteis(inicio: Date, fim: Date, cal: Calendario = CALENDARIO_PADRAO, pausas: [Date, Date][] = []): number {
  const a = inicio.getTime(), b = fim.getTime()
  let ms = msUteis(a, b, cal)
  for (const [pi, pf] of mesclar(pausas.map(([x, y]) => [Math.max(a, x.getTime()), Math.min(b, y.getTime())]))) {
    ms -= msUteis(pi, pf, cal)
  }
  return Math.max(0, ms) / 3_600_000
}

/** Instante em que se completam N horas úteis a partir do início (prazo de SLA). */
export function somarHorasUteis(inicio: Date, horas: number, cal: Calendario = CALENDARIO_PADRAO): Date {
  let restante = horas * 3_600_000
  const t0 = inicio.getTime()
  const a = new TZDate(t0, cal.fuso)
  let y = a.getFullYear(), m = a.getMonth(), d = a.getDate()
  for (let guard = 0; guard < 3700; guard++) {
    const j = janelaDoDia(y, m, d, cal)
    if (j) {
      const ini = Math.max(t0, j[0])
      if (j[1] > ini) {
        const disp = j[1] - ini
        if (disp >= restante) return new Date(ini + restante)
        restante -= disp
      }
    }
    const prox = new TZDate(y, m, d + 1, 12, 0, cal.fuso)
    y = prox.getFullYear(); m = prox.getMonth(); d = prox.getDate()
  }
  throw new Error('Prazo fora do horizonte do calendário')
}

/** Dias úteis completos entre duas datas (para idade de backlog). */
export function diasUteisEntre(inicio: Date, fim: Date, cal: Calendario = CALENDARIO_PADRAO): number {
  const [hi, mi] = HMS(cal.inicio)
  const [hf, mf] = HMS(cal.fim)
  const horasDia = hf + mf / 60 - (hi + mi / 60)
  return horasUteis(inicio, fim, cal) / horasDia
}
