import { z } from 'zod'
import { dataLocalDe, erro, ordem, resolverCompetencia, v } from './comum'

export const TIPOS_ATENDIMENTO = ['CORRETIVA', 'PREVENTIVA', 'INSTALACAO', 'RETIRADA', 'VISTORIA', 'OUTRO'] as const
export const ROTULOS_TIPO_ATENDIMENTO: Record<(typeof TIPOS_ATENDIMENTO)[number], string> = {
  CORRETIVA: 'Corretiva', PREVENTIVA: 'Preventiva', INSTALACAO: 'Instalação', RETIRADA: 'Retirada', VISTORIA: 'Vistoria', OUTRO: 'Outro',
}
export const STATUS_CHAMADO = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO'] as const
export const ROTULOS_STATUS_CHAMADO: Record<(typeof STATUS_CHAMADO)[number], string> = {
  ABERTO: 'Aberto', EM_ATENDIMENTO: 'Em atendimento', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
}
export const MOTIVOS_DESNECESSARIO = ['ELETRICA_CLIENTE', 'SEM_DEFEITO', 'INFRAESTRUTURA_CLIENTE', 'DESLIGADO', 'OPERACAO_INCORRETA', 'OUTRO'] as const
export const ROTULOS_MOTIVO_DESNECESSARIO: Record<(typeof MOTIVOS_DESNECESSARIO)[number], string> = {
  ELETRICA_CLIENTE: 'Elétrica do cliente', SEM_DEFEITO: 'Sem defeito', INFRAESTRUTURA_CLIENTE: 'Infraestrutura do cliente',
  DESLIGADO: 'Equipamento desligado', OPERACAO_INCORRETA: 'Operação incorreta', OUTRO: 'Outro',
}
export const CRITICIDADES = ['P1', 'P2', 'P3'] as const
export const ROTULOS_CRITICIDADE = { P1: 'P1 — crítica', P2: 'P2 — alta', P3: 'P3 — normal' } as const

export const chamadoExternoSchema = z
  .object({
    numero: v.txtObr(60),
    competencia: v.compOpc(),
    aberto_em: v.dhObr(),
    primeira_resposta_em: v.dhOpc(),
    atendido_em: v.dhOpc(),
    encerrado_em: v.dhOpc(),
    cliente_id: v.refOpc(),
    unidade_id: v.refOpc(),
    solicitante: v.txtOpc(200),
    familia_id: v.refOpc(),
    modelo_id: v.refOpc(),
    equipamento_id: v.refOpc(),
    identificador: v.txtOpc(120),
    equipamento_do_cliente: v.boolObr(false),
    tecnico_id: v.refOpc(),
    causa: v.txtOpc(),
    solucao: v.txtOpc(),
    tipo_atendimento: v.enumObr(TIPOS_ATENDIMENTO, ROTULOS_TIPO_ATENDIMENTO, 'CORRETIVA'),
    status: v.enumObr(STATUS_CHAMADO, ROTULOS_STATUS_CHAMADO, 'ABERTO'),
    necessario: v.boolOpc(),
    motivo_desnecessario: v.enumOpc(MOTIVOS_DESNECESSARIO, ROTULOS_MOTIVO_DESNECESSARIO),
    justificativa_desnecessario: v.txtOpc(2000),
    resolvido_primeira_visita: v.boolOpc(),
    reincidencia: v.boolOpc(),
    chamado_anterior_numero: v.txtOpc(60),
    chamado_anterior_id: v.refOpc(),
    equipamento_parado: v.boolObr(false),
    criticidade: v.enumOpc(CRITICIDADES, ROTULOS_CRITICIDADE),
    reserva_disponibilizada: v.boolOpc(),
    elegivel_sla: v.boolObr(true),
    motivo_inelegivel_sla: v.txtOpc(1000),
    valor_cobrado: v.decOpc({ min: 0 }),
    observacao: v.txtOpc(),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.aberto_em ? dataLocalDe(d.aberto_em) : null, 'abertura')
    ordem(ctx, d.aberto_em, d.primeira_resposta_em, 'primeira_resposta_em', 'A 1ª resposta não pode ser anterior à abertura.')
    ordem(ctx, d.aberto_em, d.atendido_em, 'atendido_em', 'O atendimento não pode ser anterior à abertura.')
    ordem(ctx, d.primeira_resposta_em ?? d.aberto_em, d.encerrado_em, 'encerrado_em', 'O encerramento não pode ser anterior à abertura/1ª resposta.')
    if (d.status === 'ENCERRADO' && !d.encerrado_em) erro(ctx, 'encerrado_em', 'Chamado encerrado exige data/hora de encerramento.')
    if (d.necessario === false) {
      if (!d.motivo_desnecessario) erro(ctx, 'motivo_desnecessario', 'Informe o motivo do chamado desnecessário.')
      if (!d.justificativa_desnecessario) erro(ctx, 'justificativa_desnecessario', 'Chamado desnecessário exige justificativa.')
    }
    if (!d.elegivel_sla && !d.motivo_inelegivel_sla) erro(ctx, 'motivo_inelegivel_sla', 'Informe o motivo da inelegibilidade ao SLA.')
    const reincidente = d.reincidencia === true || !!d.chamado_anterior_numero
    if (d.reincidencia === true && !d.chamado_anterior_numero) erro(ctx, 'chamado_anterior_numero', 'Reincidência exige vincular o chamado anterior.')
    if (d.chamado_anterior_numero && d.chamado_anterior_numero === d.numero) erro(ctx, 'chamado_anterior_numero', 'O chamado anterior não pode ser o próprio chamado.')
    // Equipamento parado => criticidade P1 automaticamente
    const criticidade = d.equipamento_parado ? 'P1' : d.criticidade
    return {
      ...d,
      competencia,
      criticidade,
      reincidencia: reincidente,
      chamado_anterior_id: reincidente ? d.chamado_anterior_id : null,
      motivo_desnecessario: d.necessario === false ? d.motivo_desnecessario : null,
      justificativa_desnecessario: d.necessario === false ? d.justificativa_desnecessario : null,
      motivo_inelegivel_sla: d.elegivel_sla ? null : d.motivo_inelegivel_sla,
    }
  })

export const LINHAS = ['PADRAO', 'STAR'] as const
export const ROTULOS_LINHA = { PADRAO: 'Padrão', STAR: 'Star' } as const
export const STATUS_TROCA = ['PENDENTE', 'CONCLUIDA', 'CANCELADA'] as const
export const ROTULOS_STATUS_TROCA = { PENDENTE: 'Pendente', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' } as const

export const solicitacaoTrocaSchema = z
  .object({
    competencia: v.compOpc(),
    chamado_numero: v.txtOpc(60),
    chamado_externo_id: v.refOpc(),
    cliente_id: v.refOpc(),
    cliente_texto: v.txtOpc(200),
    data_solicitacao: v.dataObr(),
    data_troca: v.dataOpc(),
    solicitado_por_tecnico_id: v.refOpc(),
    solicitado_por_texto: v.txtOpc(200),
    familia_id: v.refOpc(),
    equipamento_texto: v.txtOpc(200),
    linha: v.enumOpc(LINHAS, ROTULOS_LINHA),
    causa: v.txtOpc(),
    status: v.enumObr(STATUS_TROCA, ROTULOS_STATUS_TROCA, 'PENDENTE'),
    observacao: v.txtOpc(),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.data_solicitacao, 'data de solicitação')
    ordem(ctx, d.data_solicitacao, d.data_troca, 'data_troca', 'A troca não pode ser anterior à solicitação.')
    if (d.status === 'CONCLUIDA' && !d.data_troca) erro(ctx, 'data_troca', 'Troca concluída exige a data da troca.')
    if (!d.cliente_id && !d.cliente_texto) erro(ctx, 'cliente_id', 'Informe o cliente (cadastro ou texto).')
    return { ...d, competencia, chamado_externo_id: d.chamado_numero ? d.chamado_externo_id : null }
  })
