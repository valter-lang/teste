import { z } from 'zod'
import { erro, resolverCompetencia, v } from './comum'

export const TIPOS_MOVIMENTO = ['ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA'] as const
export const ROTULOS_TIPO_MOVIMENTO = { ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Ajuste', TRANSFERENCIA: 'Transferência' } as const
export const APLICACOES = ['INTERNA', 'EXTERNA'] as const
export const ROTULOS_APLICACAO = { INTERNA: 'Manutenção interna', EXTERNA: 'Manutenção externa' } as const

export const movimentoEstoqueSchema = z
  .object({
    competencia: v.compOpc(),
    data: v.dataObr(),
    tipo: v.enumObr(TIPOS_MOVIMENTO, ROTULOS_TIPO_MOVIMENTO),
    familia_id: v.refObr(),
    item_peca_id: v.refOpc(),
    local_estoque_id: v.refOpc(),
    local_destino_id: v.refOpc(),
    // Sinal livre apenas para AJUSTE (conferido abaixo)
    quantidade: v.decObr({}),
    valor_total: v.decOpc({}),
    motivo: v.txtOpc(1000),
    documento_origem: v.txtOpc(120),
    aplicacao: v.enumOpc(APLICACOES, ROTULOS_APLICACAO),
    justificativa_ajuste: v.txtOpc(2000),
  })
  .transform((d, ctx) => {
    const competencia = resolverCompetencia(ctx, d.competencia, d.data, 'data do movimento')
    if (d.tipo === 'AJUSTE') {
      if (!d.justificativa_ajuste) erro(ctx, 'justificativa_ajuste', 'Ajuste exige justificativa.')
      if (d.quantidade === 0 && !d.valor_total) erro(ctx, 'quantidade', 'Ajuste sem quantidade nem valor não tem efeito.')
    } else {
      if (d.quantidade <= 0) erro(ctx, 'quantidade', 'A quantidade deve ser positiva (use Ajuste com justificativa para correções).')
      if (d.valor_total !== null && d.valor_total < 0) erro(ctx, 'valor_total', 'O custo não pode ser negativo (use Ajuste com justificativa).')
    }
    if (d.tipo === 'TRANSFERENCIA') {
      if (!d.local_destino_id) erro(ctx, 'local_destino_id', 'Transferência exige o local de destino.')
      else if (d.local_destino_id === d.local_estoque_id) erro(ctx, 'local_destino_id', 'O destino deve ser diferente da origem.')
    }
    return {
      ...d,
      competencia,
      local_destino_id: d.tipo === 'TRANSFERENCIA' ? d.local_destino_id : null,
      aplicacao: d.tipo === 'SAIDA' ? d.aplicacao : null,
    }
  })
