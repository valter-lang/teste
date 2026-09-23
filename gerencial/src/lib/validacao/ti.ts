import { z } from 'zod'
import { dataLocalDe, erro, ordem, resolverCompetencia, v } from './comum'

export const SISTEMAS_ORIGEM = ['TI', 'LINEAR', 'OUTRO'] as const
export const ROTULOS_SISTEMA_ORIGEM = { TI: 'Help desk TI', LINEAR: 'Linear', OUTRO: 'Outro' } as const
export const STATUS_TI = ['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO', 'ESCALADO', 'RESOLVIDO', 'CANCELADO'] as const
export const ROTULOS_STATUS_TI = {
  ABERTO: 'Aberto', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO: 'Aguardando', ESCALADO: 'Escalado', RESOLVIDO: 'Resolvido', CANCELADO: 'Cancelado',
} as const

/** Campos de contato: tabela chamado_ti_restrito (somente com 'dados.restritos.ler'). */
export const CAMPOS_RESTRITOS_TI = ['email_tecnico', 'email_solicitante', 'ramal', 'ip_abertura', 'fechado_por_email', 'escalado_por_email'] as const

export const chamadoTiRestritoSchema = z.object({
  email_tecnico: v.emailOpc(),
  email_solicitante: v.emailOpc(),
  ramal: v.txtOpc(20),
  ip_abertura: v.txtOpc(45),
  fechado_por_email: v.emailOpc(),
  escalado_por_email: v.emailOpc(),
})

export const chamadoTiSchema = z
  .object({
    numero: v.txtObr(60),
    sistema_origem: v.enumObr(SISTEMAS_ORIGEM, ROTULOS_SISTEMA_ORIGEM, 'TI'),
    competencia: v.compOpc(),
    titulo: v.txtOpc(300),
    status: v.txtOpc(60),
    status_normalizado: v.enumObr(STATUS_TI, ROTULOS_STATUS_TI),
    tipo: v.txtOpc(60),
    prioridade: v.txtOpc(60),
    origem_canal: v.txtOpc(60),
    nivel_suporte: v.txtOpc(60),
    categoria: v.txtOpc(120),
    subcategoria: v.txtOpc(120),
    equipe: v.txtOpc(120),
    tecnico_responsavel: v.txtOpc(200),
    solicitante: v.txtOpc(200),
    departamento: v.txtOpc(120),
    unidade_texto: v.txtOpc(120),
    aberto_em: v.dhObr(),
    sla_prazo: v.dhOpc(),
    sla_violado: v.boolOpc(),
    sla_violado_em: v.dhOpc(),
    sla_horas_pausadas: v.decOpc({ min: 0 }),
    sla_desvio_h: v.decOpc({}),
    solucao: v.txtOpc(),
    causa_raiz: v.txtOpc(),
    motivo_cancelamento: v.txtOpc(1000),
    fechado_em: v.dhOpc(),
    tempo_resolucao_origem_h: v.decOpc({ min: 0 }),
    escalado_em: v.dhOpc(),
    csat_nota: v.decOpc({ min: 0, max: 5 }),
    csat_comentario: v.txtOpc(2000),
    csat_respondido_em: v.dhOpc(),
    tags: v.tags(),
    ultima_atualizacao_em: v.dhOpc(),
    resolvido_primeiro_contato: v.boolOpc(),
    chamado_anterior_numero: v.txtOpc(60),
    chamado_anterior_id: v.refOpc(),
    elegivel_sla: v.boolObr(true),
    motivo_inelegivel_sla: v.txtOpc(1000),
    dado_teste: v.boolObr(false),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.aberto_em ? dataLocalDe(d.aberto_em) : null, 'abertura')
    ordem(ctx, d.aberto_em, d.fechado_em, 'fechado_em', 'O fechamento não pode ser anterior à abertura.')
    ordem(ctx, d.aberto_em, d.escalado_em, 'escalado_em', 'O escalonamento não pode ser anterior à abertura.')
    ordem(ctx, d.aberto_em, d.sla_prazo, 'sla_prazo', 'O prazo de SLA não pode ser anterior à abertura.')
    ordem(ctx, d.fechado_em, d.csat_respondido_em, 'csat_respondido_em', 'A pesquisa não pode ser respondida antes do fechamento.')
    if (d.status_normalizado === 'RESOLVIDO' && !d.fechado_em) erro(ctx, 'fechado_em', 'Chamado resolvido exige data/hora de fechamento.')
    if (d.status_normalizado === 'CANCELADO' && !d.motivo_cancelamento) erro(ctx, 'motivo_cancelamento', 'Informe o motivo do cancelamento.')
    if (!d.elegivel_sla && !d.motivo_inelegivel_sla) erro(ctx, 'motivo_inelegivel_sla', 'Informe o motivo da inelegibilidade ao SLA.')
    if (d.chamado_anterior_numero && d.chamado_anterior_numero === d.numero) erro(ctx, 'chamado_anterior_numero', 'O chamado anterior não pode ser o próprio chamado.')
    return {
      ...d,
      competencia,
      status: d.status ?? ROTULOS_STATUS_TI[d.status_normalizado],
      chamado_anterior_id: d.chamado_anterior_numero ? d.chamado_anterior_id : null,
      motivo_inelegivel_sla: d.elegivel_sla ? null : d.motivo_inelegivel_sla,
    }
  })

export const janelaProgramadaSchema = z
  .object({
    competencia: v.compOpc(),
    sistema_id: v.refObr(),
    minutos_programados: v.intObr({ min: 1 }),
  })
  .transform((d, ctx) => ({ ...d, competencia: resolverCompetencia(ctx, d.competencia, null, '') }))

export const indisponibilidadeSchema = z
  .object({
    competencia: v.compOpc(),
    sistema_id: v.refObr(),
    inicio: v.dhObr(),
    fim: v.dhOpc(),
    planejada: v.boolObr(false),
    valida: v.boolObr(true),
    motivo_invalidacao: v.txtOpc(1000),
    causa: v.txtOpc(2000),
    chamado_ti_numero: v.txtOpc(60),
    chamado_ti_id: v.refOpc(),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.inicio ? dataLocalDe(d.inicio) : null, 'data de início')
    ordem(ctx, d.inicio, d.fim, 'fim', 'O fim não pode ser anterior ao início.')
    if (!d.valida && !d.motivo_invalidacao) erro(ctx, 'motivo_invalidacao', 'Informe o motivo da invalidação.')
    return { ...d, competencia, motivo_invalidacao: d.valida ? null : d.motivo_invalidacao, chamado_ti_id: d.chamado_ti_numero ? d.chamado_ti_id : null }
  })

export const backupExecucaoSchema = z
  .object({
    competencia: v.compOpc(),
    data: v.dataObr(),
    rotina: v.txtObr(200),
    sistema_id: v.refOpc(),
    programado: v.boolObr(true),
    concluido: v.boolObr(),
    observacao: v.txtOpc(2000),
  })
  .transform((d, ctx) => ({ ...d, competencia: resolverCompetencia(ctx, d.competencia, d.data, 'data da execução') }))

export const testeRestauracaoSchema = z
  .object({
    competencia: v.compOpc(),
    data: v.dataObr(),
    sistema_id: v.refOpc(),
    rotina: v.txtObr(200),
    sucesso: v.boolObr(),
    tempo_restauracao_min: v.intOpc({ min: 0 }),
    evidencia: v.txtOpc(2000),
  })
  .transform((d, ctx) => ({ ...d, competencia: resolverCompetencia(ctx, d.competencia, d.data, 'data do teste') }))

export const STATUS_INCIDENTE = ['ABERTO', 'RESOLVIDO', 'CAUSA_TRATADA'] as const
export const ROTULOS_STATUS_INCIDENTE = { ABERTO: 'Aberto', RESOLVIDO: 'Resolvido', CAUSA_TRATADA: 'Causa tratada' } as const

export const incidenteCriticoSchema = z
  .object({
    competencia: v.compOpc(),
    numero: v.txtOpc(60),
    sistema_id: v.refOpc(),
    aberto_em: v.dhObr(),
    resolvido_em: v.dhOpc(),
    descricao: v.txtObr(),
    causa_raiz: v.txtOpc(),
    acao_corretiva: v.txtOpc(),
    responsavel: v.txtOpc(200),
    prazo_acao: v.dataOpc(),
    status: v.enumObr(STATUS_INCIDENTE, ROTULOS_STATUS_INCIDENTE, 'ABERTO'),
    seguranca: v.boolObr(false),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.aberto_em ? dataLocalDe(d.aberto_em) : null, 'abertura')
    ordem(ctx, d.aberto_em, d.resolvido_em, 'resolvido_em', 'A resolução não pode ser anterior à abertura.')
    if (d.status !== 'ABERTO' && !d.resolvido_em) erro(ctx, 'resolvido_em', 'Informe a data/hora de resolução.')
    if (d.status === 'CAUSA_TRATADA') {
      if (!d.causa_raiz) erro(ctx, 'causa_raiz', 'Causa tratada exige a causa raiz.')
      if (!d.acao_corretiva) erro(ctx, 'acao_corretiva', 'Causa tratada exige a ação corretiva.')
      if (!d.responsavel) erro(ctx, 'responsavel', 'Causa tratada exige o responsável.')
    }
    return { ...d, competencia }
  })

export const STATUS_PROJETO = ['PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO'] as const
export const ROTULOS_STATUS_PROJETO = {
  PLANEJADO: 'Planejado', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', SUSPENSO: 'Suspenso', CANCELADO: 'Cancelado',
} as const

export const projetoSchema = z
  .object({
    nome: v.txtObr(200),
    responsavel: v.txtOpc(200),
    roadmap_aprovado: v.boolObr(false),
    status: v.enumObr(STATUS_PROJETO, ROTULOS_STATUS_PROJETO, 'EM_ANDAMENTO'),
    inicio: v.dataOpc(),
    fim_previsto: v.dataOpc(),
  })
  .transform((d, ctx) => {
    ordem(ctx, d.inicio, d.fim_previsto, 'fim_previsto', 'O fim previsto não pode ser anterior ao início.')
    return d
  })

export const marcoSchema = z
  .object({
    projeto_id: v.refObr(),
    competencia: v.compOpc(),
    descricao: v.txtObr(500),
    data_planejada: v.dataObr(),
    data_realizada: v.dataOpc(),
    percentual_concluido: v.decObr({ min: 0, max: 100 }, 0),
    observacao_desvio: v.txtOpc(2000),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.data_planejada, 'data planejada')
    if (d.data_realizada && d.percentual_concluido < 100) erro(ctx, 'percentual_concluido', 'Marco realizado deve estar 100% concluído.')
    if (d.data_realizada && d.data_realizada > d.data_planejada && !d.observacao_desvio) {
      erro(ctx, 'observacao_desvio', 'Marco entregue com atraso exige observação do desvio.')
    }
    return { ...d, competencia }
  })

/** Desvio em dias corridos: realizado (ou hoje, se pendente) − planejado; positivo = atraso. */
export function desvioDias(planejada: string, realizada: string | null, hoje: string): number {
  const ref = realizada ?? (hoje > planejada ? hoje : planejada)
  return Math.round((Date.parse(ref) - Date.parse(planejada)) / 86_400_000)
}

export const patchCicloSchema = z
  .object({
    competencia: v.compOpc(),
    patches_criticos_liberados: v.intObr({ min: 0 }),
    aplicados_ate_30_dias: v.intObr({ min: 0 }),
  })
  .transform((d, ctx) => {
    if (d.aplicados_ate_30_dias > d.patches_criticos_liberados) {
      erro(ctx, 'aplicados_ate_30_dias', 'Aplicados não pode exceder os patches críticos liberados.')
    }
    return { ...d, competencia: resolverCompetencia(ctx, d.competencia, null, '') }
  })
