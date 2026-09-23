/**
 * Semáforo oficial.
 *  - Verde: atingiu a meta.
 *  - Amarelo: fora da meta, mas dentro da tolerância (padrão 5%, relativa à meta e na direção do indicador).
 *  - Vermelho: além da tolerância.
 * Denominador zero / dado ausente => NA (nunca verde automático). Sem meta homologada => SEM_META.
 * A classificação usa o valor com 6 casas (elimina ruído de ponto flutuante), não o valor exibido.
 */
export type Status = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'SEM_META' | 'NA'
export type Operador = '>=' | '<=' | '=' | 'ENTRE'

export interface AlvoMeta {
  operador: Operador
  alvo: number
  alvoMax?: number | null
  toleranciaPct: number
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6

/** Limite do amarelo para uma meta, na direção do indicador. */
export function limiteTolerancia(a: AlvoMeta): { inferior?: number; superior?: number } {
  const t = a.toleranciaPct / 100
  switch (a.operador) {
    case '>=':
      return { inferior: r6(a.alvo - Math.abs(a.alvo) * t) }
    case '<=':
      return { superior: r6(a.alvo + Math.abs(a.alvo) * t) }
    case '=':
      return { inferior: r6(a.alvo - Math.abs(a.alvo) * t), superior: r6(a.alvo + Math.abs(a.alvo) * t) }
    case 'ENTRE':
      return { inferior: r6(a.alvo - Math.abs(a.alvo) * t), superior: r6((a.alvoMax ?? a.alvo) + Math.abs(a.alvoMax ?? a.alvo) * t) }
  }
}

export function classificar(valor: number | null | undefined, meta: AlvoMeta | null | undefined): Status {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'NA'
  if (!meta || meta.alvo === null || meta.alvo === undefined || !Number.isFinite(meta.alvo)) return 'SEM_META'
  const v = r6(valor)
  const lim = limiteTolerancia(meta)
  switch (meta.operador) {
    case '>=':
      if (v >= r6(meta.alvo)) return 'VERDE'
      return v >= lim.inferior! ? 'AMARELO' : 'VERMELHO'
    case '<=':
      if (v <= r6(meta.alvo)) return 'VERDE'
      return v <= lim.superior! ? 'AMARELO' : 'VERMELHO'
    case '=':
      if (v === r6(meta.alvo)) return 'VERDE'
      return v >= lim.inferior! && v <= lim.superior! ? 'AMARELO' : 'VERMELHO'
    case 'ENTRE': {
      const max = r6(meta.alvoMax ?? meta.alvo)
      if (v >= r6(meta.alvo) && v <= max) return 'VERDE'
      return v >= lim.inferior! && v <= lim.superior! ? 'AMARELO' : 'VERMELHO'
    }
  }
}

/** Status de metas de tendência (ex.: "tendência de queda no semestre"): inclinação da regressão linear. */
export function classificarTendencia(serie: (number | null)[], sentido: 'QUEDA' | 'ALTA'): Status {
  const pts = serie.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null)
  if (pts.length < 3) return 'NA'
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  const num = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0)
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  const incl = den === 0 ? 0 : num / den
  const alvoOk = sentido === 'QUEDA' ? incl < 0 : incl > 0
  if (alvoOk) return 'VERDE'
  return Math.abs(incl) < 1e-9 ? 'AMARELO' : 'VERMELHO'
}

export function descreverMeta(a: AlvoMeta, unidade: string, casas = 1): string {
  const f = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v)
  const u = unidade === '%' ? '%' : unidade === 'qtd' ? '' : ` ${unidade}`
  switch (a.operador) {
    case '>=':
      return `≥ ${f(a.alvo)}${u}`
    case '<=':
      return `≤ ${f(a.alvo)}${u}`
    case '=':
      return `= ${f(a.alvo)}${u}`
    case 'ENTRE':
      return `entre ${f(a.alvo)} e ${f(a.alvoMax ?? a.alvo)}${u}`
  }
}
