import { describe, expect, it } from 'vitest'
import { consolidar, resolverAlvo, type MetaRow } from '@/lib/indicadores/motor'
import { mesesDoEscopo, somarMeses, ultimoDia, rotuloEscopo } from '@/lib/competencia'

const mes = (competencia: string, valor: number | null, numerador?: number | null, denominador?: number | null, situacao: 'OK' | 'NAO_INFORMADO' | 'NAO_APLICAVEL' = 'OK') =>
  ({ competencia, valor, numerador, denominador, situacao, fonte: 'EVENTOS' as const })

describe('consolidação — não mistura fotografia, soma e média', () => {
  it('fotografia = última competência (base instalada no semestre)', () => {
    const r = consolidar('FOTOGRAFIA', [mes('2026-01-01', 100), mes('2026-02-01', 110), mes('2026-03-01', 90)], 1)
    expect(r.valor).toBe(90)
  })
  it('soma (instalações e retiradas somadas)', () => {
    expect(consolidar('SOMA', [mes('2026-04-01', 20), mes('2026-05-01', 11), mes('2026-06-01', 16)], 1).valor).toBe(47)
  })
  it('soma com mês não informado => não informado (ausência não vira zero)', () => {
    const r = consolidar('SOMA', [mes('2026-04-01', 20), mes('2026-05-01', null, null, null, 'NAO_INFORMADO')], 1)
    expect(r.valor).toBeNull()
    expect(r.situacao).toBe('NAO_INFORMADO')
    expect(r.motivo).toContain('2026-05')
  })
  it('SLA recalculado pelo total elegível, não média de percentuais', () => {
    // Mês 1: 9/10 = 90% ; Mês 2: 100/100 = 100% -> média simples 95%, correto 109/110 = 99,09%
    const r = consolidar('MEDIA_PONDERADA', [mes('2026-01-01', 90, 9, 10), mes('2026-02-01', 100, 100, 100)], 100)
    expect(r.valor).toBeCloseTo(99.0909, 3)
    expect(r.numerador).toBe(109)
    expect(r.denominador).toBe(110)
  })
  it('reincidência de julho/26 (17 de 360 atendimentos) = 4,72%', () => {
    const r = consolidar('MEDIA_PONDERADA', [mes('2026-07-01', null, 17, 360)], 100)
    expect(r.valor).toBeCloseTo(4.722, 2)
  })
  it('denominador zero no período => N/A', () => {
    const r = consolidar('MEDIA_PONDERADA', [mes('2026-01-01', null, 0, 0, 'NAO_APLICAVEL')], 100)
    expect(r.situacao).toBe('NAO_APLICAVEL')
    expect(r.valor).toBeNull()
  })
  it('média simples', () => {
    expect(consolidar('MEDIA_SIMPLES', [mes('2026-01-01', 2), mes('2026-02-01', 4)], 1).valor).toBe(3)
  })
})

describe('competências e escopos', () => {
  it('meses do escopo acumulam até a referência', () => {
    expect(mesesDoEscopo('2026-08-01', 'TRIMESTRE')).toEqual(['2026-07-01', '2026-08-01'])
    expect(mesesDoEscopo('2026-08-01', 'SEMESTRE')).toEqual(['2026-07-01', '2026-08-01'])
    expect(mesesDoEscopo('2026-06-01', 'SEMESTRE')).toHaveLength(6)
    expect(mesesDoEscopo('2026-03-01', 'ANO')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })
  it('somar meses e último dia', () => {
    expect(somarMeses('2026-01-01', -1)).toBe('2025-12-01')
    expect(somarMeses('2026-11-01', 3)).toBe('2027-02-01')
    expect(ultimoDia('2026-02-01')).toBe('2026-02-28')
    expect(ultimoDia('2028-02-01')).toBe('2028-02-29')
  })
  it('rótulos', () => {
    expect(rotuloEscopo('2026-08-01', 'TRIMESTRE')).toBe('3º tri/2026')
    expect(rotuloEscopo('2026-08-01', 'SEMESTRE')).toBe('2º sem/2026')
  })
})

describe('resolução do alvo das metas', () => {
  const base: MetaRow = {
    id: 1, indicador_codigo: 'X', versao: 1, ciclo: 'MENSAL', tipo: 'ABSOLUTA', operador: '>=', valor: 5, valor_max: null,
    linha_base: null, linha_base_competencia: null, tolerancia_pct: 5, vigencia_inicio: '2026-01-01', vigencia_fim: null,
    status: 'APROVADA', fonte_documento: 'x', motivo: 'x',
  }
  it('absoluta', () => expect(resolverAlvo(base, { fimCompetencia: '2026-07-01', valorAnterior: null, valorFimCicloAnterior: null }).alvo).toBe(5))
  it('linha de base + 5/mês sem linha de base => pendente (não presume)', () => {
    const r = resolverAlvo({ ...base, tipo: 'LINHA_BASE_MAIS' }, { fimCompetencia: '2026-07-01', valorAnterior: null, valorFimCicloAnterior: null })
    expect(r.alvo).toBeNull()
    expect(r.observacao).toMatch(/pendente/i)
  })
  it('linha de base + 5/mês com linha de base', () => {
    const r = resolverAlvo({ ...base, tipo: 'LINHA_BASE_MAIS', linha_base: 1000, linha_base_competencia: '2026-06-01' }, { fimCompetencia: '2026-08-01', valorAnterior: null, valorFimCicloAnterior: null })
    expect(r.alvo).toBe(1010)
  })
  it('trimestral +15 sobre o fim do ciclo anterior', () => {
    const r = resolverAlvo({ ...base, ciclo: 'TRIMESTRAL', tipo: 'LINHA_BASE_MAIS', valor: 15 }, { fimCompetencia: '2026-09-01', valorAnterior: null, valorFimCicloAnterior: 1000 })
    expect(r.alvo).toBe(1015)
  })
  it('percentual sobre linha de base', () => {
    expect(resolverAlvo({ ...base, tipo: 'PERCENTUAL_SOBRE_LINHA_BASE', valor: 10, linha_base: 200 }, { fimCompetencia: '2026-07-01', valorAnterior: null, valorFimCicloAnterior: null }).alvo).toBeCloseTo(220)
  })
  it('variação sobre o período anterior (metas urgentes: +15% de produtividade)', () => {
    const r = resolverAlvo({ ...base, tipo: 'VARIACAO_PERIODO_ANTERIOR', valor: 15 }, { fimCompetencia: '2026-07-01', valorAnterior: 160, valorFimCicloAnterior: null })
    expect(r.alvo).toBeCloseTo(184)
  })
})
