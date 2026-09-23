import 'server-only'
import { pool, q1, type Db } from '@/lib/db'

/** Situação do fechamento mensal de uma área (sem registro = rascunho). */
export type StatusPeriodoArea = 'RASCUNHO' | 'EM_PREENCHIMENTO' | 'EM_VALIDACAO' | 'APROVADO' | 'FECHADO'

export const ROTULO_STATUS_PERIODO: Record<StatusPeriodoArea, string> = {
  RASCUNHO: 'Rascunho',
  EM_PREENCHIMENTO: 'Em preenchimento',
  EM_VALIDACAO: 'Em validação',
  APROVADO: 'Aprovado',
  FECHADO: 'Fechado',
}

export const periodoBloqueado = (s: StatusPeriodoArea) => s === 'APROVADO' || s === 'FECHADO'

export async function statusPeriodo(area: string, competencia: string | null | undefined, db: Db = pool()): Promise<StatusPeriodoArea> {
  if (!competencia) return 'RASCUNHO'
  const r = await q1<{ status: StatusPeriodoArea }>(
    `select status from periodo_area where area_codigo = $1 and competencia = date_trunc('month', $2::date)::date`, [area, competencia], db)
  return r?.status ?? 'RASCUNHO'
}
