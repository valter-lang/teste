/**
 * Calculadores mensais dos indicadores. Cada um devolve numerador/denominador (ou valor)
 * de UMA competência, com memória de cálculo. A consolidação em trimestre/semestre/ano é
 * feita pelo motor a partir destes componentes (nunca pela média de percentuais).
 */
import { q, q1, type Db } from '@/lib/db'
import { ultimoDia } from '@/lib/competencia'
import { horasUteis, diasUteisEntre, somarHorasUteis, type Calendario } from '@/lib/horas-uteis'
import { lerSerie, competenciasInformadas, type SerieCodigo } from './series'
import type { AreaCodigo } from '@/lib/auth/permissoes'

export type SituacaoDado = 'OK' | 'NAO_INFORMADO' | 'NAO_APLICAVEL'
export type FonteResultado = 'EVENTOS' | 'HISTORICO' | 'MISTO' | 'NENHUMA'

export interface ResultadoMes {
  valor: number | null
  numerador?: number | null
  denominador?: number | null
  situacao: SituacaoDado
  motivo?: string
  fonte: FonteResultado
  detalhes?: Record<string, unknown>
}

export interface ContextoCalculo {
  db: Db
  comp: string
  cal: Calendario
  config: Record<string, unknown>
}

type Calculador = { tabelas: string[]; mes: (c: ContextoCalculo) => Promise<ResultadoMes> }

const naoInformado = (motivo: string, detalhes?: Record<string, unknown>): ResultadoMes => ({ valor: null, situacao: 'NAO_INFORMADO', motivo, fonte: 'NENHUMA', detalhes })
const naoAplicavel = (motivo: string, detalhes?: Record<string, unknown>): ResultadoMes => ({ valor: null, situacao: 'NAO_APLICAVEL', motivo, fonte: 'NENHUMA', detalhes })

/** Taxa num/den × fator com política de denominador zero = N/A. */
function taxa(num: number | null, den: number | null, fonte: FonteResultado, fator = 100, detalhes?: Record<string, unknown>, rotuloDen = 'denominador'): ResultadoMes {
  if (num === null || den === null) return { ...naoInformado('Dados de origem não informados na competência.', detalhes), numerador: num, denominador: den }
  if (den === 0) return { ...naoAplicavel(`Sem ${rotuloDen} na competência (denominador zero).`, detalhes), numerador: num, denominador: 0, fonte }
  return { valor: (num / den) * fator, numerador: num, denominador: den, situacao: 'OK', fonte, detalhes }
}

async function valorSerie(ctx: ContextoCalculo, codigo: SerieCodigo) {
  const r = await lerSerie(codigo, [ctx.comp], null, ctx.db)
  return r.porMes[ctx.comp]
}

function contagemSerie(codigo: SerieCodigo): Calculador['mes'] {
  return async (ctx) => {
    const s = await valorSerie(ctx, codigo)
    if (s.situacao !== 'OK' || s.valor === null) return naoInformado('Área sem lançamentos na competência e período ainda não validado.', { serie: codigo, fonte: s.fonte })
    return { valor: s.valor, numerador: s.valor, situacao: 'OK', fonte: s.fonte, detalhes: { serie: codigo } }
  }
}

async function baseAtiva(ctx: ContextoCalculo): Promise<number | null> {
  const r = await q1<{ v: number }>(`select equipamentos_ativos::float8 as v from comodato_base_ativa where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
  return r?.v ?? null
}

async function informado(ctx: ContextoCalculo, area: AreaCodigo) {
  return (await competenciasInformadas(area, [ctx.comp], ctx.db)).has(ctx.comp)
}

async function declaracao(ctx: ContextoCalculo, area: AreaCodigo, chave: string): Promise<boolean | null> {
  const r = await q1<{ valor: boolean }>(`select valor from declaracao_periodo where competencia = $1 and area_codigo = $2 and chave = $3`, [ctx.comp, area, chave], ctx.db)
  return r ? r.valor : null
}

export const CALCULADORES: Record<string, Calculador> = {
  // ------------------------------------------------------------ Comodato / manutenção
  CO_BASE_ATIVA: {
    tabelas: ['comodato_base_ativa'],
    mes: async (ctx) => {
      const b = await baseAtiva(ctx)
      if (b === null) return naoInformado('Base instalada ativa não registrada (integração Protheus ou lançamento auditado).')
      return { valor: b, numerador: b, situacao: 'OK', fonte: 'EVENTOS' }
    },
  },
  CO_MOV_LIQUIDO: {
    tabelas: ['comodato_movimento', 'importacao'],
    mes: async (ctx) => {
      const e = await valorSerie(ctx, 'CO_ENTREGAS')
      const r = await valorSerie(ctx, 'CO_RETIRADAS')
      if (e.situacao !== 'OK' || r.situacao !== 'OK' || e.valor === null || r.valor === null) return naoInformado('Entregas ou retiradas não informadas.')
      return { valor: e.valor - r.valor, numerador: e.valor, denominador: r.valor, situacao: 'OK', fonte: e.fonte === r.fonte ? e.fonte : 'MISTO',
        detalhes: { instalacoes: e.valor, retiradas: r.valor, observacao: 'Instalações = entregas concluídas (definição pendente de homologação).' } }
    },
  },
  MI_SUCATEADOS: { tabelas: ['manut_interna', 'importacao'], mes: contagemSerie('MI_SUCATEADOS') },
  MI_RECUPERACOES: { tabelas: ['manut_interna', 'importacao'], mes: contagemSerie('MI_RECUPERADOS') },
  MI_LAVAGENS: { tabelas: ['manut_interna', 'importacao'], mes: contagemSerie('MI_LAVAGENS') },
  ME_ATENDIMENTOS: { tabelas: ['chamado_externo', 'importacao'], mes: contagemSerie('ME_ATENDIMENTOS') },
  ME_TROCAS: { tabelas: ['solicitacao_troca', 'importacao'], mes: contagemSerie('ME_TROCAS_QTD') },
  EP_VALOR_ENTRADAS: { tabelas: ['movimento_estoque', 'importacao'], mes: contagemSerie('EP_ENTRADA_RS') },
  EP_VALOR_SAIDAS: { tabelas: ['movimento_estoque', 'importacao'], mes: contagemSerie('EP_SAIDA_RS') },
  CO_ENTREGAS_SEM_EXITO: { tabelas: ['comodato_tentativa', 'comodato_movimento', 'importacao'], mes: contagemSerie('CO_SEM_EXITO') },
  TI_CHAMADOS_ABERTOS: { tabelas: ['chamado_ti'], mes: contagemSerie('TI_ABERTOS') },

  CO_VOLUME_POR_EQUIP: {
    tabelas: ['comodato_consumo', 'comodato_base_ativa'],
    mes: async (ctx) => {
      const b = await baseAtiva(ctx)
      const k = await q1<{ kg: number | null; n: number }>(`select sum(kg_comprados)::float8 as kg, count(*)::int as n from comodato_consumo where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!k || k.n === 0) return naoInformado('Volume comprado (kg) não informado.')
      if (b === null) return naoInformado('Base ativa não informada.')
      return taxa(k.kg ?? 0, b, 'EVENTOS', 1, undefined, 'base ativa')
    },
  },
  CO_CLIENTES_ABAIXO_MIN: {
    tabelas: ['comodato_consumo'],
    mes: async (ctx) => {
      const r = await q1<{ abaixo: number; aplic: number; total: number }>(
        `select count(*) filter (where aplicavel_minimo and consumo_minimo_kg is not null and kg_comprados < consumo_minimo_kg)::int as abaixo,
                count(*) filter (where aplicavel_minimo and consumo_minimo_kg is not null)::int as aplic, count(*)::int as total
           from comodato_consumo where competencia = $1 and excluido_em is null and cliente_id is not null`, [ctx.comp], ctx.db)
      if (!r || r.total === 0) return naoInformado('Consumo por cliente não informado.')
      return taxa(r.abaixo, r.aplic, 'EVENTOS', 100, undefined, 'clientes com mínimo cadastrado')
    },
  },
  ME_CHAMADOS_100EQ: {
    tabelas: ['chamado_externo', 'comodato_base_ativa', 'importacao'],
    mes: async (ctx) => {
      const c = await valorSerie(ctx, 'ME_CHAMADOS')
      const b = await baseAtiva(ctx)
      if (c.situacao !== 'OK' || c.valor === null) return naoInformado('Chamados externos não informados.')
      if (b === null) return { ...naoInformado('Base instalada ativa não informada: o denominador é obrigatório.'), numerador: c.valor }
      return taxa(c.valor, b, c.fonte, 100, undefined, 'base ativa')
    },
  },
  ME_SLA_PRIMEIRA_RESPOSTA: {
    tabelas: ['chamado_externo', 'calendario_feriado', 'configuracao'],
    mes: async (ctx) => {
      if (!(await informado(ctx, 'MANUT_EXTERNA'))) return naoInformado('Sem chamados lançados no sistema (a planilha não registra a 1ª resposta).')
      const horas = Number(ctx.config['manut_externa.sla_primeira_resposta_horas_uteis'] ?? 48)
      const rows = await q<{ id: number; aberto_em: Date; primeira_resposta_em: Date | null }>(
        `select id, aberto_em, primeira_resposta_em from chamado_externo
          where competencia = $1 and excluido_em is null and status <> 'CANCELADO' and elegivel_sla`, [ctx.comp], ctx.db)
      const agora = new Date()
      let noPrazo = 0, elegiveis = 0, semResposta = 0
      for (const r of rows) {
        const prazo = somarHorasUteis(new Date(r.aberto_em), horas, ctx.cal)
        if (!r.primeira_resposta_em) {
          // Sem resposta: só entra no denominador quando o prazo já venceu
          if (prazo <= agora) { elegiveis++; semResposta++ }
          continue
        }
        elegiveis++
        if (new Date(r.primeira_resposta_em) <= prazo) noPrazo++
      }
      return taxa(noPrazo, elegiveis, 'EVENTOS', 100, { horas_uteis_prazo: horas, sem_resposta_vencidos: semResposta }, 'chamados elegíveis')
    },
  },
  ME_REINCIDENCIA: {
    tabelas: ['chamado_externo', 'importacao', 'configuracao'],
    mes: async (ctx) => {
      const r = await valorSerie(ctx, 'ME_REINCIDENCIAS')
      const a = await valorSerie(ctx, 'ME_ATENDIMENTOS')
      if (r.situacao !== 'OK' || a.situacao !== 'OK') return naoInformado('Reincidências ou atendimentos não informados.')
      const janela = ctx.config['manut_externa.janela_reincidencia_dias']
      return taxa(r.valor, a.valor, r.fonte === a.fonte ? r.fonte : 'MISTO', 100,
        { janela_dias: janela ?? 'pendente (conta vínculos explícitos)' }, 'atendimentos')
    },
  },
  ME_DESNECESSARIOS: {
    tabelas: ['chamado_externo', 'importacao'],
    mes: async (ctx) => {
      const d = await valorSerie(ctx, 'ME_DESNECESSARIOS')
      const n = await valorSerie(ctx, 'ME_NECESSARIOS')
      if (d.situacao !== 'OK' || n.situacao !== 'OK' || d.valor === null || n.valor === null) return naoInformado('Classificação de chamados não informada.')
      return taxa(d.valor, d.valor + n.valor, d.fonte, 100, { necessarios: n.valor }, 'chamados classificados')
    },
  },
  MI_HIGIENIZACAO: {
    tabelas: ['manut_interna'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; aplic: number }>(
        `select count(*) filter (where retorno_aplicavel_higienizacao and (resultado = 'HIGIENIZADO' or tipo_servico = 'HIGIENIZACAO'))::int as ok,
                count(*) filter (where retorno_aplicavel_higienizacao)::int as aplic
           from manut_interna where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!r || r.aplic === 0) {
        if (!(await informado(ctx, 'MANUT_INTERNA'))) return naoInformado('Sem lançamentos de retornos (a planilha registra só a quantidade de lavagens).')
      }
      return taxa(r?.ok ?? 0, r?.aplic ?? 0, 'EVENTOS', 100, undefined, 'retornos aplicáveis')
    },
  },
  MI_PREVENTIVA_PLANO: {
    tabelas: ['manut_interna', 'manut_preventiva_plano'],
    mes: async (ctx) => {
      const p = await q1<{ plan: number | null }>(`select sum(quantidade_planejada)::float8 as plan from manut_preventiva_plano where competencia = $1`, [ctx.comp], ctx.db)
      if (p?.plan === null || p?.plan === undefined) return naoInformado('Plano de preventivas não cadastrado.')
      const r = await q1<{ n: number }>(`select count(*)::float8 as n from manut_interna where competencia = $1 and excluido_em is null and tipo_servico = 'PREVENTIVA' and resultado <> 'PENDENTE'`, [ctx.comp], ctx.db)
      return taxa(r?.n ?? 0, p.plan, 'EVENTOS', 100, undefined, 'preventivas planejadas')
    },
  },
  EP_FALTA_PECA_CRITICA: {
    tabelas: ['movimento_estoque', 'item_peca'],
    mes: async (ctx) => {
      const fim = ultimoDia(ctx.comp)
      const r = await q1<{ criticos: number; zerados: number }>(
        `select count(*)::int as criticos,
                count(*) filter (where coalesce(s.saldo, 0) <= 0)::int as zerados
           from item_peca i
           left join (select item_peca_id, sum(case tipo when 'ENTRADA' then quantidade when 'SAIDA' then -quantidade when 'AJUSTE' then quantidade else 0 end) as saldo
                        from movimento_estoque where excluido_em is null and data <= $1 and item_peca_id is not null group by 1) s on s.item_peca_id = i.id
          where i.critico and i.ativo`, [fim], ctx.db)
      if (!r || r.criticos === 0) return naoInformado('Nenhum item crítico cadastrado.')
      const mov = await q1<{ n: number }>(`select count(*)::int as n from movimento_estoque where item_peca_id is not null and excluido_em is null and data <= $1`, [fim], ctx.db)
      if (!mov?.n) return naoInformado('Saldo inicial por item não carregado.')
      return { valor: r.zerados, numerador: r.zerados, denominador: r.criticos, situacao: 'OK', fonte: 'EVENTOS', detalhes: { itens_criticos: r.criticos } }
    },
  },
  EP_COBERTURA_FAMILIA_A: {
    tabelas: ['movimento_estoque', 'familia_peca'],
    mes: async (ctx) => {
      const fim = ultimoDia(ctx.comp)
      const fams = await q1<{ n: number }>(`select count(*)::int as n from familia_peca where classe_abc = 'A' and ativo`, [], ctx.db)
      if (!fams?.n) return naoInformado('Classificação ABC das famílias não cadastrada.')
      const r = await q1<{ saldo: number | null; consumo: number | null; mov: number }>(
        `select sum(case m.tipo when 'ENTRADA' then m.valor_total when 'SAIDA' then -m.valor_total when 'AJUSTE' then m.valor_total else 0 end)::float8 as saldo,
                (sum(case when m.tipo = 'SAIDA' and m.data > ($1::date - interval '3 months') then m.valor_total else 0 end) / 3)::float8 as consumo,
                count(*)::int as mov
           from movimento_estoque m join familia_peca f on f.id = m.familia_id
          where f.classe_abc = 'A' and m.excluido_em is null and m.data <= $1`, [fim], ctx.db)
      if (!r || !r.mov) return naoInformado('Sem movimentações das famílias A lançadas no sistema.')
      return taxa(r.saldo ?? 0, r.consumo ?? 0, 'EVENTOS', 1, undefined, 'consumo médio')
    },
  },
  ME_CLIENTES_RECORRENTES_PLANO: {
    tabelas: ['chamado_externo', 'plano_acao'],
    mes: async (ctx) => {
      if (!(await informado(ctx, 'MANUT_EXTERNA'))) return naoInformado('Sem chamados lançados no sistema (histórico sem vínculo a planos de ação).')
      const r = await q1<{ recorrentes: number; com_plano: number }>(
        `with rec as (select cliente_id from chamado_externo where competencia = $1 and excluido_em is null and status <> 'CANCELADO' and cliente_id is not null
                       group by cliente_id having count(*) >= 3)
         select count(*)::int as recorrentes,
                count(*) filter (where exists (select 1 from plano_acao p where p.cliente_id = rec.cliente_id and p.status <> 'CANCELADA'))::int as com_plano
           from rec`, [ctx.comp], ctx.db)
      return taxa(r?.com_plano ?? 0, r?.recorrentes ?? 0, 'EVENTOS', 100, undefined, 'clientes recorrentes')
    },
  },
  ME_PARADOS_48H: {
    tabelas: ['chamado_externo', 'calendario_feriado'],
    mes: async (ctx) => {
      if (!(await informado(ctx, 'MANUT_EXTERNA'))) return naoInformado('Sem chamados lançados no sistema.')
      const rows = await q<{ aberto_em: Date; encerrado_em: Date }>(
        `select aberto_em, encerrado_em from chamado_externo where competencia = $1 and excluido_em is null and equipamento_parado and encerrado_em is not null`, [ctx.comp], ctx.db)
      const ok = rows.filter((r) => horasUteis(new Date(r.aberto_em), new Date(r.encerrado_em), ctx.cal) <= 48).length
      return taxa(ok, rows.length, 'EVENTOS', 100, undefined, 'equipamentos parados encerrados')
    },
  },

  // ------------------------------------------------------------ TI
  TI_DISPONIBILIDADE: {
    tabelas: ['ti_janela_programada', 'ti_indisponibilidade'],
    mes: async (ctx) => {
      const prog = await q1<{ min: number | null }>(`select sum(j.minutos_programados)::float8 as min from ti_janela_programada j join ti_sistema s on s.id = j.sistema_id where j.competencia = $1 and s.critico`, [ctx.comp], ctx.db)
      if (!prog?.min) return naoInformado('Tempo programado dos sistemas críticos não cadastrado.')
      const ind = await q1<{ min: number | null; abertas: number }>(
        `select sum(extract(epoch from (least(coalesce(i.fim, $2::timestamptz), $2::timestamptz) - greatest(i.inicio, $3::timestamptz))) / 60)::float8 as min,
                count(*) filter (where i.fim is null)::int as abertas
           from ti_indisponibilidade i join ti_sistema s on s.id = i.sistema_id
          where i.competencia = $1 and i.excluido_em is null and i.valida and not i.planejada and s.critico`,
        [ctx.comp, `${ultimoDia(ctx.comp)}T23:59:59-03:00`, `${ctx.comp}T00:00:00-03:00`], ctx.db)
      const indisp = Math.max(0, ind?.min ?? 0)
      return taxa(prog.min - indisp, prog.min, 'EVENTOS', 100, { minutos_indisponiveis: indisp, eventos_em_aberto: ind?.abertas ?? 0 }, 'tempo programado')
    },
  },
  TI_SLA: {
    tabelas: ['chamado_ti'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; eleg: number; sem_info: number }>(
        `select count(*) filter (where sla_violado is false)::int as ok,
                count(*) filter (where sla_violado is not null)::int as eleg,
                count(*) filter (where sla_violado is null)::int as sem_info
           from chamado_ti where date_trunc('month', fechado_em at time zone 'America/Sao_Paulo')::date = $1
            and excluido_em is null and not dado_teste and status_normalizado = 'RESOLVIDO' and elegivel_sla`, [ctx.comp], ctx.db)
      if (!(await informado(ctx, 'TI')) && !r?.eleg) return naoInformado('Sem chamados de TI na competência.')
      return taxa(r?.ok ?? 0, r?.eleg ?? 0, 'EVENTOS', 100, { resolvidos_sem_marcacao_sla: r?.sem_info ?? 0, base: 'resolvidos no mês' }, 'chamados resolvidos elegíveis')
    },
  },
  TI_MTTR: {
    tabelas: ['chamado_ti', 'calendario_feriado', 'configuracao'],
    mes: async (ctx) => {
      const rows = await q<{ aberto_em: Date; fechado_em: Date; pausa: number | null }>(
        `select aberto_em, fechado_em, sla_horas_pausadas::float8 as pausa from chamado_ti
          where date_trunc('month', fechado_em at time zone 'America/Sao_Paulo')::date = $1
            and excluido_em is null and not dado_teste and status_normalizado = 'RESOLVIDO' and elegivel_sla`, [ctx.comp], ctx.db)
      if (!rows.length) {
        if (!(await informado(ctx, 'TI'))) return naoInformado('Sem chamados de TI na competência.')
        return naoAplicavel('Nenhum chamado resolvido na competência (denominador zero).')
      }
      let soma = 0
      for (const r of rows) soma += Math.max(0, horasUteis(new Date(r.aberto_em), new Date(r.fechado_em), ctx.cal) - (r.pausa ?? 0))
      return taxa(soma, rows.length, 'EVENTOS', 1, { observacao: 'Pausas descontadas pelo total informado na exportação.' }, 'chamados resolvidos')
    },
  },
  TI_BACKLOG_7DU: {
    tabelas: ['chamado_ti', 'calendario_feriado', 'configuracao'],
    mes: async (ctx) => {
      const limite = Number(ctx.config['ti.backlog_dias_uteis'] ?? 7)
      const fim = new Date(`${ultimoDia(ctx.comp)}T23:59:59-03:00`)
      const rows = await q<{ aberto_em: Date }>(
        `select aberto_em from chamado_ti
          where excluido_em is null and not dado_teste and aberto_em <= $1
            and (fechado_em is null or fechado_em > $1) and status_normalizado not in ('CANCELADO')
            and not (status_normalizado = 'RESOLVIDO' and fechado_em is null)`, [fim], ctx.db)
      if (!(await informado(ctx, 'TI')) && !rows.length) return naoInformado('Sem chamados de TI registrados.')
      const velhos = rows.filter((r) => diasUteisEntre(new Date(r.aberto_em), fim, ctx.cal) > limite).length
      return taxa(velhos, rows.length, 'EVENTOS', 100, { dias_uteis_limite: limite, backlog: rows.length }, 'backlog aberto')
    },
  },
  TI_BACKUP: {
    tabelas: ['ti_backup_execucao'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; prog: number }>(`select count(*) filter (where concluido and programado)::int as ok, count(*) filter (where programado)::int as prog from ti_backup_execucao where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!r?.prog) return naoInformado('Execuções de backup não registradas.')
      return taxa(r.ok, r.prog, 'EVENTOS', 100, undefined, 'backups programados')
    },
  },
  TI_TESTES_RESTAURACAO: {
    tabelas: ['ti_teste_restauracao'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; total: number }>(`select count(*) filter (where sucesso)::int as ok, count(*)::int as total from ti_teste_restauracao where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!r?.total) {
        const d = await declaracao(ctx, 'TI', 'SEM_TESTE_RESTAURACAO')
        if (d) return { valor: 0, numerador: 0, situacao: 'OK', fonte: 'EVENTOS', detalhes: { declaracao: 'Gestor declarou que não houve teste no mês.' } }
        return naoInformado('Nenhum teste de restauração registrado nem declaração do gestor.')
      }
      return { valor: r.ok, numerador: r.ok, denominador: r.total, situacao: 'OK', fonte: 'EVENTOS', detalhes: { testes_registrados: r.total } }
    },
  },
  TI_P1_SEM_CAUSA: {
    tabelas: ['ti_incidente_critico', 'declaracao_periodo'],
    mes: async (ctx) => {
      const fim = `${ultimoDia(ctx.comp)}T23:59:59-03:00`
      const r = await q1<{ total: number; sem: number }>(
        `select count(*)::int as total,
                count(*) filter (where status <> 'CAUSA_TRATADA' or coalesce(causa_raiz,'') = '' or coalesce(acao_corretiva,'') = '' or coalesce(responsavel,'') = '')::int as sem
           from ti_incidente_critico where excluido_em is null and not seguranca and aberto_em <= $1`, [fim], ctx.db)
      const doMes = await q1<{ n: number }>(`select count(*)::int as n from ti_incidente_critico where excluido_em is null and not seguranca and competencia = $1`, [ctx.comp], ctx.db)
      if (!doMes?.n) {
        const d = await declaracao(ctx, 'TI', 'SEM_P1')
        if (!d) return naoInformado('Nenhum P1 registrado e sem declaração "não houve P1" do gestor.')
      }
      return { valor: r?.sem ?? 0, numerador: r?.sem ?? 0, denominador: r?.total ?? 0, situacao: 'OK', fonte: 'EVENTOS', detalhes: { p1_acumulados: r?.total ?? 0 } }
    },
  },
  TI_SEGURANCA_PENDENTES: {
    tabelas: ['ti_incidente_critico', 'declaracao_periodo'],
    mes: async (ctx) => {
      const fim = `${ultimoDia(ctx.comp)}T23:59:59-03:00`
      const r = await q1<{ abertos: number; total: number }>(
        `select count(*) filter (where status = 'ABERTO')::int as abertos, count(*)::int as total
           from ti_incidente_critico where excluido_em is null and seguranca and aberto_em <= $1`, [fim], ctx.db)
      if (!r?.total) {
        const d = await declaracao(ctx, 'TI', 'SEM_INCIDENTE_SEGURANCA')
        if (!d) return naoInformado('Sem registros de segurança e sem declaração do gestor.')
      }
      return { valor: r?.abertos ?? 0, numerador: r?.abertos ?? 0, situacao: 'OK', fonte: 'EVENTOS' }
    },
  },
  TI_PROJETOS_CRONOGRAMA: {
    tabelas: ['ti_marco'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; plan: number }>(
        `select count(*) filter (where data_realizada is not null and data_realizada <= data_planejada)::int as ok, count(*)::int as plan
           from ti_marco where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!r?.plan) return naoInformado('Nenhuma entrega planejada registrada para a competência.')
      return taxa(r.ok, r.plan, 'EVENTOS', 100, undefined, 'entregas planejadas')
    },
  },
  TI_FCR: {
    tabelas: ['chamado_ti'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; marc: number }>(
        `select count(*) filter (where resolvido_primeiro_contato)::int as ok, count(*) filter (where resolvido_primeiro_contato is not null)::int as marc
           from chamado_ti where competencia = $1 and excluido_em is null and not dado_teste and status_normalizado = 'RESOLVIDO'`, [ctx.comp], ctx.db)
      if (!r?.marc) return naoInformado('Chamados sem marcação de resolução no primeiro contato.')
      return taxa(r.ok, r.marc, 'EVENTOS', 100, undefined, 'chamados com marcação')
    },
  },
  TI_CSAT: {
    tabelas: ['chamado_ti'],
    mes: async (ctx) => {
      const r = await q1<{ soma: number | null; n: number }>(
        `select sum(csat_nota)::float8 as soma, count(csat_nota)::int as n from chamado_ti where competencia = $1 and excluido_em is null and not dado_teste`, [ctx.comp], ctx.db)
      if (!r?.n) return naoInformado('Nenhuma avaliação de satisfação respondida.')
      return taxa(r.soma ?? 0, r.n, 'EVENTOS', 1, undefined, 'respostas')
    },
  },
  TI_PATCHES_30D: {
    tabelas: ['ti_patch_ciclo'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; lib: number }>(`select aplicados_ate_30_dias as ok, patches_criticos_liberados as lib from ti_patch_ciclo where competencia = $1`, [ctx.comp], ctx.db)
      if (!r) return naoInformado('Ciclo de patches não registrado.')
      return taxa(r.ok, r.lib, 'EVENTOS', 100, undefined, 'patches críticos liberados')
    },
  },
  // ------------------------------------------------------------ Candidatos com cálculo disponível
  MI_TAXA_RECUPERACAO: {
    tabelas: ['manut_interna'],
    mes: async (ctx) => {
      const r = await q1<{ rec: number; tot: number }>(`select count(*) filter (where resultado = 'RECUPERADO')::int as rec, count(*) filter (where resultado in ('RECUPERADO','SUCATEADO'))::int as tot from manut_interna where competencia = $1 and excluido_em is null`, [ctx.comp], ctx.db)
      if (!(await informado(ctx, 'MANUT_INTERNA'))) return naoInformado('Sem lançamentos individuais da oficina.')
      return taxa(r?.rec ?? 0, r?.tot ?? 0, 'EVENTOS', 100, undefined, 'equipamentos com desfecho')
    },
  },
  MI_TEMPO_CICLO: {
    tabelas: ['manut_interna'],
    mes: async (ctx) => {
      const r = await q1<{ soma: number | null; n: number }>(`select sum(data_conclusao - data_recebimento)::float8 as soma, count(*)::int as n from manut_interna where competencia = $1 and excluido_em is null and data_conclusao is not null and data_recebimento is not null`, [ctx.comp], ctx.db)
      if (!r?.n) return naoInformado('Sem datas de entrada e conclusão.')
      return taxa(r.soma ?? 0, r.n, 'EVENTOS', 1, undefined, 'manutenções concluídas')
    },
  },
  ME_FCR: {
    tabelas: ['chamado_externo'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; marc: number }>(`select count(*) filter (where resolvido_primeira_visita)::int as ok, count(*) filter (where resolvido_primeira_visita is not null)::int as marc from chamado_externo where competencia = $1 and excluido_em is null and status = 'ENCERRADO'`, [ctx.comp], ctx.db)
      if (!r?.marc) return naoInformado('Sem marcação de primeira visita.')
      return taxa(r.ok, r.marc, 'EVENTOS', 100, undefined, 'atendimentos com marcação')
    },
  },
  CO_ENTREGA_1A_TENTATIVA: {
    tabelas: ['comodato_tentativa'],
    mes: async (ctx) => {
      const r = await q1<{ ok: number; tot: number }>(`select count(*) filter (where t.sucesso and t.numero = 1)::int as ok, count(distinct t.movimento_id)::int as tot from comodato_tentativa t where t.competencia = $1`, [ctx.comp], ctx.db)
      if (!r?.tot) return naoInformado('Tentativas não registradas.')
      return taxa(r.ok, r.tot, 'EVENTOS', 100, undefined, 'movimentos com tentativa')
    },
  },
  CO_LEAD_TIME: {
    tabelas: ['comodato_movimento'],
    mes: async (ctx) => {
      const r = await q1<{ soma: number | null; n: number }>(`select sum(data_conclusao - data_solicitacao)::float8 as soma, count(*)::int as n from comodato_movimento where competencia = $1 and excluido_em is null and situacao = 'CONCLUIDO'`, [ctx.comp], ctx.db)
      if (!r?.n) return naoInformado('Sem movimentos concluídos com datas.')
      return taxa(r.soma ?? 0, r.n, 'EVENTOS', 1, undefined, 'movimentos concluídos')
    },
  },
  PENDENTE: {
    tabelas: [],
    mes: async () => naoAplicavel('Fórmula e fonte de dados ainda não homologadas.'),
  },
}
