import 'server-only'
import { pool, q, q1, type Db } from '@/lib/db'
import { CALENDARIO_PADRAO, type Calendario } from '@/lib/horas-uteis'

/**
 * Calendário oficial: expediente (configuracao 'calendario.expediente') + feriados
 * (nacionais e, quando informada, os da unidade). Feriados de meio período não são
 * descontados (o tipo Calendario trabalha com dias inteiros).
 */
export async function carregarCalendario(unidadeId?: number | null, db: Db = pool()): Promise<Calendario> {
  const cfg = await q1<{ valor: { fuso?: string; inicio?: string; fim?: string; dias_uteis?: number[] } | null }>(
    `select valor from configuracao where chave = 'calendario.expediente'`, [], db)
  const v = cfg?.valor ?? {}
  const feriados = await q<{ data: string }>(
    `select data from calendario_feriado where not meio_periodo and (unidade_id is null or unidade_id = $1)`, [unidadeId ?? null], db)
  const hhmm = (s: unknown, p: string) => (typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) ? s : p)
  return {
    fuso: typeof v.fuso === 'string' ? v.fuso : CALENDARIO_PADRAO.fuso,
    diasUteis: Array.isArray(v.dias_uteis) && v.dias_uteis.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? v.dias_uteis : CALENDARIO_PADRAO.diasUteis,
    inicio: hhmm(v.inicio, CALENDARIO_PADRAO.inicio),
    fim: hhmm(v.fim, CALENDARIO_PADRAO.fim),
    feriados: new Set(feriados.map((f) => f.data)),
  }
}
