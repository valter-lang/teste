import { z } from 'zod'
import { erro, ordem, resolverCompetencia, v } from './comum'

export const TIPOS_COMODATO = ['ENTREGA', 'TROCA', 'RETIRADA'] as const
export const ROTULOS_TIPO_COMODATO = { ENTREGA: 'Entrega', TROCA: 'Troca', RETIRADA: 'Retirada' } as const
export const SITUACOES_COMODATO = ['SOLICITADO', 'AGENDADO', 'CONCLUIDO', 'SEM_EXITO', 'CANCELADO'] as const
export const ROTULOS_SITUACAO_COMODATO = {
  SOLICITADO: 'Solicitado', AGENDADO: 'Agendado', CONCLUIDO: 'Concluído', SEM_EXITO: 'Sem êxito', CANCELADO: 'Cancelado',
} as const
export const ORIGENS = ['MANUAL', 'IMPORTACAO', 'INTEGRACAO'] as const
export const ROTULOS_ORIGEM = { MANUAL: 'Lançamento manual', IMPORTACAO: 'Importação', INTEGRACAO: 'Integração (Protheus)' } as const

export const comodatoMovimentoSchema = z
  .object({
    competencia: v.compOpc(),
    solicitacao_numero: v.txtOpc(60),
    cliente_id: v.refOpc(),
    cliente_texto: v.txtOpc(200),
    familia_id: v.refOpc(),
    equipamento_id: v.refOpc(),
    tipo: v.enumObr(TIPOS_COMODATO, ROTULOS_TIPO_COMODATO),
    campanha_fim_ano: v.boolObr(false),
    data_solicitacao: v.dataObr(),
    data_agendamento: v.dataOpc(),
    data_conclusao: v.dataOpc(),
    situacao: v.enumObr(SITUACOES_COMODATO, ROTULOS_SITUACAO_COMODATO, 'SOLICITADO'),
    motivo_insucesso: v.txtOpc(1000),
    responsavel: v.txtOpc(200),
    observacao: v.txtOpc(),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.data_solicitacao, 'data de solicitação')
    ordem(ctx, d.data_solicitacao, d.data_agendamento, 'data_agendamento', 'O agendamento não pode ser anterior à solicitação.')
    ordem(ctx, d.data_solicitacao, d.data_conclusao, 'data_conclusao', 'A conclusão não pode ser anterior à solicitação.')
    if (d.situacao === 'CONCLUIDO' && !d.data_conclusao) erro(ctx, 'data_conclusao', 'Situação concluída exige a data de conclusão.')
    if (d.situacao === 'AGENDADO' && !d.data_agendamento) erro(ctx, 'data_agendamento', 'Situação agendada exige a data de agendamento.')
    if (d.situacao === 'SEM_EXITO' && !d.motivo_insucesso) erro(ctx, 'motivo_insucesso', 'Informe o motivo do insucesso.')
    if (!d.cliente_id && !d.cliente_texto) erro(ctx, 'cliente_id', 'Informe o cliente (cadastro ou texto).')
    return { ...d, competencia }
  })

export const comodatoTentativaSchema = z
  .object({
    data: v.dataObr(),
    sucesso: v.boolObr(),
    motivo_insucesso: v.txtOpc(1000),
    marcar_sem_exito: v.boolObr(false),
  })
  .transform((d, ctx) => {
    if (!d.sucesso && !d.motivo_insucesso) erro(ctx, 'motivo_insucesso', 'Tentativa sem sucesso exige o motivo.')
    return { ...d, competencia: `${d.data.slice(0, 7)}-01`, motivo_insucesso: d.sucesso ? null : d.motivo_insucesso }
  })

/** Conciliação: anterior + entradas − saídas + ajuste = novos + usados. Retorna a diferença (0 = concilia). */
export function diferencaConciliacao(p: {
  posicao_anterior: number; entradas: number; saidas_novos: number; saidas_usados: number; ajuste: number; novos: number; usados: number
}): number {
  return p.posicao_anterior + p.entradas - p.saidas_novos - p.saidas_usados + p.ajuste - (p.novos + p.usados)
}

export const comodatoPosicaoSchema = z
  .object({
    competencia: v.compOpc(),
    produto: v.txtObr(200),
    familia_id: v.refOpc(),
    unidade_id: v.refOpc(),
    posicao_anterior: v.intObr({ min: 0 }),
    entradas: v.intObr({ min: 0 }, 0),
    saidas_novos: v.intObr({ min: 0 }, 0),
    saidas_usados: v.intObr({ min: 0 }, 0),
    novos: v.intObr({ min: 0 }),
    usados: v.intObr({ min: 0 }),
    manutencao_interna: v.intOpc({ min: 0 }),
    sucata: v.intOpc({ min: 0 }),
    custo_total_novos: v.decOpc({ min: 0 }),
    custo_total_usados: v.decOpc({ min: 0 }),
    ajuste: v.intObr({}, 0),
    justificativa_ajuste: v.txtOpc(2000),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, null, '')
    const dif = diferencaConciliacao(d)
    if (dif !== 0) {
      erro(ctx, 'ajuste', `Não concilia: anterior + entradas − saídas ${d.ajuste ? '+ ajuste ' : ''}difere de novos + usados em ${dif > 0 ? '' : '−'}${Math.abs(dif)}. Corrija os valores ou informe o ajuste de ${-dif} com justificativa.`)
    }
    if (d.ajuste !== 0 && !d.justificativa_ajuste) erro(ctx, 'justificativa_ajuste', 'Ajuste exige justificativa.')
    return { ...d, competencia }
  })

export const comodatoBaseAtivaSchema = z
  .object({
    competencia: v.compOpc(),
    equipamentos_ativos: v.intObr({ min: 0 }),
    clientes_ativos: v.intOpc({ min: 0 }),
    instalacoes: v.intOpc({ min: 0 }),
    retiradas: v.intOpc({ min: 0 }),
    origem: v.enumObr(ORIGENS, ROTULOS_ORIGEM, 'MANUAL'),
    evidencia: v.txtOpc(2000),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, null, '')
    if (!d.evidencia) erro(ctx, 'evidencia', 'Informe a evidência (relatório, consulta ou documento de origem da fotografia).')
    return { ...d, competencia }
  })

export const comodatoConsumoSchema = z
  .object({
    competencia: v.compOpc(),
    cliente_id: v.refObr(),
    kg_comprados: v.decObr({ min: 0 }),
    consumo_minimo_kg: v.decOpc({ min: 0 }),
    aplicavel_minimo: v.boolObr(true),
  })
  .transform((d, ctx) => ({ ...d, competencia: resolverCompetencia(ctx, d.competencia, null, '') }))
