import 'server-only'
import { mensagemErroDb, pool, q, tx, type Db } from '@/lib/db'
import { ultimoDia } from '@/lib/competencia'
import { horasUteis, type Calendario } from '@/lib/horas-uteis'
import { TZDate } from '@date-fns/tz'
import { carregarCalendario } from './calendario'

/** Minutos de expediente no mês pelo calendário oficial (dias úteis × horário). */
export function minutosExpediente(competencia: string, cal: Calendario): number {
  const [y, m] = competencia.split('-').map(Number)
  const fimDia = Number(ultimoDia(competencia).slice(8, 10))
  const inicio = new TZDate(y, m - 1, 1, 0, 0, cal.fuso)
  const fim = new TZDate(y, m - 1, fimDia, 23, 59, 59, cal.fuso)
  return Math.round(horasUteis(inicio, fim, cal) * 60)
}

export async function sugestaoJanela(competencia: string, db: Db = pool()) {
  return minutosExpediente(competencia, await carregarCalendario(null, db))
}

/** Cria a janela pelo expediente para os sistemas ativos ainda sem janela na competência. */
export async function preencherJanelasPeloExpediente(competencia: string, usuarioId: string): Promise<{ ok: boolean; criadas?: number; erro?: string }> {
  try {
    const minutos = await sugestaoJanela(competencia)
    if (minutos <= 0) return { ok: false, erro: 'O calendário não tem dias úteis nesta competência.' }
    const criadas = await tx({ usuarioId }, async (db) => {
      const r = await db.query(
        `insert into ti_janela_programada (competencia, sistema_id, minutos_programados, criado_por)
         select $1::date, s.id, $2, $3 from ti_sistema s
          where s.ativo and not exists (select 1 from ti_janela_programada j where j.competencia = $1::date and j.sistema_id = s.id)`,
        [competencia, minutos, usuarioId])
      return r.rowCount ?? 0
    })
    return { ok: true, criadas }
  } catch (e) {
    return { ok: false, erro: mensagemErroDb(e) }
  }
}

/** Marcos de um projeto (para o detalhe do projeto). */
export async function marcosDoProjeto(projetoId: number, db: Db = pool()) {
  return q<{ id: number; descricao: string; data_planejada: string; data_realizada: string | null; percentual_concluido: number; desvio_dias: number }>(
    `select id, descricao, data_planejada, data_realizada, percentual_concluido,
            (coalesce(data_realizada, greatest((now() at time zone 'America/Sao_Paulo')::date, data_planejada)) - data_planejada) as desvio_dias
       from ti_marco where projeto_id = $1 and excluido_em is null order by data_planejada, id`, [projetoId], db)
}
