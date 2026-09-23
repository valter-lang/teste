import { z } from 'zod'
import { erro, ordem, resolverCompetencia, v } from './comum'

export const TIPOS_SERVICO = ['RECUPERACAO', 'HIGIENIZACAO', 'PREVENTIVA', 'DIAGNOSTICO'] as const
export const ROTULOS_TIPO_SERVICO: Record<(typeof TIPOS_SERVICO)[number], string> = {
  RECUPERACAO: 'Recuperação', HIGIENIZACAO: 'Higienização', PREVENTIVA: 'Preventiva', DIAGNOSTICO: 'Diagnóstico',
}
export const RESULTADOS = ['RECUPERADO', 'SUCATEADO', 'HIGIENIZADO', 'PENDENTE'] as const
export const ROTULOS_RESULTADO: Record<(typeof RESULTADOS)[number], string> = {
  RECUPERADO: 'Recuperado', SUCATEADO: 'Sucateado', HIGIENIZADO: 'Higienizado', PENDENTE: 'Pendente',
}

/** Linha de peça utilizada (vira movimento de estoque SAIDA vinculado). */
export const linhaPecaSchema = z.object({
  id: v.intOpc({ min: 1 }),
  familia_id: v.refObr(),
  item_peca_id: v.refOpc(),
  local_estoque_id: v.refOpc(),
  quantidade: v.decObr({ min: 0.001 }),
  valor_total: v.decOpc({ min: 0 }),
})
export type LinhaPeca = z.infer<typeof linhaPecaSchema>

/** Valida a lista de peças (JSON vindo do editor). Erros indexados por linha (1-based). */
export function validarPecas(json: string | undefined): { linhas: LinhaPeca[]; erros: string[] } {
  if (!json || !json.trim()) return { linhas: [], erros: [] }
  let bruto: unknown
  try {
    bruto = JSON.parse(json)
  } catch {
    return { linhas: [], erros: ['Lista de peças inválida'] }
  }
  if (!Array.isArray(bruto)) return { linhas: [], erros: ['Lista de peças inválida'] }
  const linhas: LinhaPeca[] = []
  const erros: string[] = []
  bruto.forEach((l, i) => {
    const vazia = !l || Object.values(l as object).every((x) => x === '' || x === null || x === undefined)
    if (vazia) return
    const r = linhaPecaSchema.safeParse(l)
    if (r.success) linhas.push(r.data)
    else erros.push(`Peça ${i + 1}: ${r.error.issues.map((x) => `${rotuloPeca(String(x.path[0]))} — ${x.message}`).join('; ')}`)
  })
  return { linhas, erros }
}
const rotuloPeca = (c: string) =>
  ({ familia_id: 'família da peça', item_peca_id: 'item', local_estoque_id: 'local', quantidade: 'quantidade', valor_total: 'custo' })[c] ?? c

export const manutInternaSchema = z
  .object({
    competencia: v.compOpc(),
    unidade_id: v.refOpc(),
    data_recebimento: v.dataOpc(),
    data_conclusao: v.dataOpc(),
    familia_id: v.refObr(),
    modelo_id: v.refOpc(),
    equipamento_id: v.refOpc(),
    identificador: v.txtOpc(120),
    tipo_servico: v.enumObr(TIPOS_SERVICO, ROTULOS_TIPO_SERVICO),
    resultado: v.enumObr(RESULTADOS, ROTULOS_RESULTADO),
    retorno_aplicavel_higienizacao: v.boolOpc(),
    tecnico_id: v.refOpc(),
    motivo_sucateamento: v.txtOpc(1000),
    custo_mao_obra: v.decOpc({ min: 0 }),
    observacao: v.txtOpc(),
  })
  .transform((d, ctx) => {
    // Competência = mês da conclusão (quando concluído); senão não pode ser anterior ao recebimento.
    const competencia = resolverCompetencia(ctx, d.competencia, d.data_conclusao ?? d.data_recebimento, d.data_conclusao ? 'data de conclusão' : 'data de recebimento', !!d.data_conclusao)
    if (!d.data_conclusao && d.data_recebimento && competencia && competencia < `${d.data_recebimento.slice(0, 7)}-01`) {
      erro(ctx, 'competencia', 'A competência não pode ser anterior ao mês de recebimento.')
    }
    ordem(ctx, d.data_recebimento, d.data_conclusao, 'data_conclusao', 'A conclusão não pode ser anterior ao recebimento.')
    if (d.resultado === 'SUCATEADO' && !d.motivo_sucateamento) erro(ctx, 'motivo_sucateamento', 'Informe o motivo do sucateamento.')
    if (d.resultado !== 'PENDENTE' && !d.data_conclusao) erro(ctx, 'data_conclusao', 'Informe a data de conclusão (ou use resultado Pendente).')
    return { ...d, competencia }
  })

export const preventivaPlanoSchema = z
  .object({
    competencia: v.compOpc(),
    familia_id: v.refOpc(),
    quantidade_planejada: v.intObr({ min: 0 }),
  })
  .transform((d, ctx) => ({ ...d, competencia: resolverCompetencia(ctx, d.competencia, null, '') }))
