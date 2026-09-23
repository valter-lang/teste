import { describe, expect, it } from 'vitest'
import { acaoVaga, EsquemaPlano } from '@/lib/planos'

const base = {
  area_codigo: 'MANUT_EXTERNA', indicador_codigo: 'ME_REINCIDENCIA', competencia_origem: '2026-07-01', causa_raiz: 'Falta de treinamento em fornos a gás',
  acao: 'Treinar os técnicos Matias e Adriano em regulagem de queimador', entregavel: 'Lista de presença e checklist aplicado',
  responsavel_nome: 'Gestor de Manutenção', inicio: '2026-08-01', prazo: '2026-08-31', criticidade: 'ALTA', resultado_esperado: 'Reincidência ≤ 5%',
}

describe('planos de ação', () => {
  it('aceita plano completo', () => expect(EsquemaPlano.safeParse(base).success).toBe(true))
  it('proíbe "acompanhar" sem entregável', () => {
    expect(acaoVaga('Acompanhar', '')).not.toBeNull()
    expect(acaoVaga('Acompanhar os indicadores', 'x')).not.toBeNull()
    expect(EsquemaPlano.safeParse({ ...base, acao: 'Acompanhar os números', entregavel: 'ok' }).success).toBe(false)
  })
  it('exige responsável, prazo coerente e origem', () => {
    expect(EsquemaPlano.safeParse({ ...base, responsavel_nome: '' }).success).toBe(false)
    expect(EsquemaPlano.safeParse({ ...base, prazo: '2026-07-01' }).success).toBe(false)
    expect(EsquemaPlano.safeParse({ ...base, indicador_codigo: '', ocorrencia: '' }).success).toBe(false)
  })
})
