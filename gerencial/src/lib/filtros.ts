import 'server-only'
import { cookies } from 'next/headers'
import { competenciaAtual, somarMeses, validarCompetencia } from './competencia'

export const COOKIE_COMPETENCIA = 'cl_competencia'

/** Competência escolhida: parâmetro > preferência salva > mês anterior ao atual. */
export async function competenciaSelecionada(param?: string | string[]): Promise<string> {
  const p = Array.isArray(param) ? param[0] : param
  if (p && validarCompetencia(p)) return p
  const c = (await cookies()).get(COOKIE_COMPETENCIA)?.value
  if (c && validarCompetencia(c)) return c
  return somarMeses(competenciaAtual(), -1)
}

export function paramTexto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim().slice(0, 200) : undefined
}

export function paramInteiro(v: string | string[] | undefined, padrao: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n > 0 ? n : padrao
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Competências disponíveis no seletor: jan/2025 até o mês atual (mais recente primeiro). */
export function opcoesCompetencia(): string[] {
  const atual = competenciaAtual()
  const out: string[] = []
  for (let c = atual; c >= '2025-01-01'; c = somarMeses(c, -1)) out.push(c)
  return out
}
