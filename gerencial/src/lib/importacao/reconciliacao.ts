/**
 * Reconciliação pós-gravação: compara os totais de referência extraídos da
 * planilha (gravados em importacao.resumo.referencias) com os totais relidos
 * do banco para a mesma importação.
 */
import { pool, q, q1, type Db } from '@/lib/db'
import type { ReferenciaReconciliacao } from './planilha'

export interface LinhaReconciliacao {
  aba: string
  serie: string
  competencia: string | null
  celula: string | null
  planilha: number
  sistema: number
  diferenca: number
  confere: boolean
}

const arred = (n: number, c = 4) => Math.round(n * 10 ** c) / 10 ** c

export async function relatorioReconciliacao(importacaoId: number, db: Db = pool()): Promise<LinhaReconciliacao[]> {
  const imp = await q1<{ resumo: { referencias?: ReferenciaReconciliacao[] } | null }>('select resumo from importacao where id = $1', [importacaoId], db)
  if (!imp) throw new Error(`Importação ${importacaoId} não encontrada`)
  const refs = imp.resumo?.referencias ?? []
  const id = String(importacaoId)

  const series = await q<{ serie: string; competencia: string; soma: number; n: number }>(
    `select serie, competencia, sum(valor) as soma, count(*)::int as n from historico_agregado where importacao_id = $1 group by serie, competencia`, [importacaoId], db)
  const serieSoma = new Map(series.map((s) => [`${s.serie}|${s.competencia}`, s.soma]))
  const serieCont = new Map(series.map((s) => [`${s.serie}|${s.competencia}`, s.n]))

  const trocas = new Map((await q<{ competencia: string; n: number }>(
    `select competencia, count(*)::int as n from solicitacao_troca
      where origem = 'IMPORTACAO' and origem_ref->>'importacao_id' = $1 and excluido_em is null group by competencia`, [id], db)).map((r) => [r.competencia, r.n]))

  const detalhes = new Map((await q<{ tipo: string; competencia: string; n: number }>(
    `select tipo, competencia, count(*)::int as n from historico_detalhe where importacao_id = $1 group by tipo, competencia`, [importacaoId], db)).map((r) => [`${r.tipo}|${r.competencia}`, r.n]))

  const comodato = new Map((await q<{ competencia: string; usados: number; novos: number; atual: number }>(
    `select competencia, coalesce(sum(custo_total_usados),0) as usados, coalesce(sum(custo_total_novos),0) as novos, sum(novos + usados)::int as atual
       from comodato_posicao where origem = 'IMPORTACAO' and origem_ref->>'importacao_id' = $1 and excluido_em is null group by competencia`, [id], db)).map((r) => [r.competencia, r]))

  const ti = (await q1<Record<string, number | null>>(
    `select count(*) filter (where sistema_origem = 'TI')::int as "TI",
            count(*) filter (where sistema_origem = 'LINEAR')::int as "LINEAR",
            count(*)::int as "TOTAL",
            count(*) filter (where sistema_origem = 'TI' and status_normalizado not in ('RESOLVIDO','CANCELADO'))::int as "ABERTOS_TI",
            count(*) filter (where sistema_origem = 'TI' and status_normalizado = 'RESOLVIDO')::int as "RESOLVIDOS_TI",
            count(*) filter (where sistema_origem = 'TI' and status_normalizado = 'CANCELADO')::int as "CANCELADOS_TI",
            count(*) filter (where sistema_origem = 'TI' and sla_violado)::int as "SLA_VIOLADO_TI",
            round(avg(tempo_resolucao_origem_h) filter (where sistema_origem = 'TI' and status_normalizado = 'RESOLVIDO'), 1)::float as "TEMPO_MEDIO_TI"
       from chamado_ti where origem = 'IMPORTACAO' and origem_ref->>'importacao_id' = $1 and excluido_em is null`, [id], db)) ?? {}

  return refs.map((r) => {
    const c = r.competencia ?? ''
    let sistema = 0
    let tolerancia = 0.005
    switch (r.consulta.tipo) {
      case 'SERIE_SOMA':
        sistema = r.consulta.series.reduce((s, x) => s + (serieSoma.get(`${x}|${c}`) ?? 0), 0)
        break
      case 'SERIE_CONTAGEM':
        sistema = serieCont.get(`${r.consulta.serie}|${c}`) ?? 0
        break
      case 'TROCAS':
        sistema = trocas.get(c) ?? 0
        break
      case 'DETALHE':
        sistema = detalhes.get(`${r.consulta.detalhe}|${c}`) ?? 0
        break
      case 'COMODATO': {
        const p = comodato.get(c)
        sistema = !p ? 0 : r.consulta.campo === 'custo_total_usados' ? p.usados : r.consulta.campo === 'custo_total_novos' ? p.novos : p.atual
        break
      }
      case 'TI':
        sistema = Number(ti[r.consulta.metrica] ?? 0)
        if (r.consulta.metrica === 'TEMPO_MEDIO_TI') tolerancia = 0.05
        break
    }
    sistema = arred(sistema)
    const diferenca = arred(sistema - r.planilha)
    return { aba: r.aba, serie: r.serie, competencia: r.competencia, celula: r.celula, planilha: r.planilha, sistema, diferenca, confere: Math.abs(diferenca) <= tolerancia }
  })
}
