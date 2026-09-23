import 'server-only'
import type { EntidadeDef } from '@/lib/cadastros/definicoes'
import { opcoesReferencia } from '@/lib/cadastros/servico'
import type { OpcaoRef } from './FormCadastro'

/** Opções de cada campo de referência (ativos + valor atual, mesmo desativado). */
export async function carregarOpcoes(def: EntidadeDef, valores: Record<string, unknown>): Promise<Record<string, OpcaoRef[]>> {
  const out: Record<string, OpcaoRef[]> = {}
  await Promise.all(def.campos.filter((c) => c.tipo === 'referencia' && c.referencia).map(async (c) => {
    const atual = Number(valores[c.nome])
    out[c.nome] = await opcoesReferencia(c.referencia!, Number.isInteger(atual) && atual > 0 ? [atual] : [])
  }))
  return out
}
