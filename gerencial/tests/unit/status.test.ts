import { describe, expect, it } from 'vitest'
import { classificar, classificarTendencia, limiteTolerancia, descreverMeta } from '@/lib/indicadores/status'

const maiorIgual95 = { operador: '>=' as const, alvo: 95, toleranciaPct: 5 }
const menorIgual5 = { operador: '<=' as const, alvo: 5, toleranciaPct: 5 }

describe('semáforo — exemplos da especificação', () => {
  it('meta >= 95%: verde a partir de 95%', () => {
    expect(classificar(95, maiorIgual95)).toBe('VERDE')
    expect(classificar(99.9, maiorIgual95)).toBe('VERDE')
  })
  it('meta >= 95%: amarelo de 90,25% a 94,99%', () => {
    expect(limiteTolerancia(maiorIgual95).inferior).toBe(90.25)
    expect(classificar(94.99, maiorIgual95)).toBe('AMARELO')
    expect(classificar(90.25, maiorIgual95)).toBe('AMARELO')
  })
  it('meta >= 95%: vermelho abaixo de 90,25%', () => {
    expect(classificar(90.2499, maiorIgual95)).toBe('VERMELHO')
    expect(classificar(50, maiorIgual95)).toBe('VERMELHO')
  })
  it('meta <= 5%: verde até 5%', () => {
    expect(classificar(5, menorIgual5)).toBe('VERDE')
    expect(classificar(0, menorIgual5)).toBe('VERDE')
  })
  it('meta <= 5%: amarelo acima de 5% até 5,25%', () => {
    expect(limiteTolerancia(menorIgual5).superior).toBe(5.25)
    expect(classificar(5.01, menorIgual5)).toBe('AMARELO')
    expect(classificar(5.25, menorIgual5)).toBe('AMARELO')
  })
  it('meta <= 5%: vermelho acima de 5,25%', () => {
    expect(classificar(5.2501, menorIgual5)).toBe('VERMELHO')
    expect(classificar(7.8, menorIgual5)).toBe('VERMELHO')
  })
  it('ruído de ponto flutuante não altera a classe', () => {
    expect(classificar(0.1 + 0.2 + 94.7, maiorIgual95)).toBe('VERDE')
  })
})

describe('semáforo — regras gerais', () => {
  it('denominador zero / ausência => N/A, nunca verde', () => {
    expect(classificar(null, maiorIgual95)).toBe('NA')
    expect(classificar(undefined, maiorIgual95)).toBe('NA')
    expect(classificar(Number.NaN, maiorIgual95)).toBe('NA')
  })
  it('sem meta homologada => SEM_META', () => {
    expect(classificar(10, null)).toBe('SEM_META')
  })
  it('meta zero (<= 0) não tem faixa amarela', () => {
    const zero = { operador: '<=' as const, alvo: 0, toleranciaPct: 5 }
    expect(classificar(0, zero)).toBe('VERDE')
    expect(classificar(1, zero)).toBe('VERMELHO')
  })
  it('faixa entre 1 e 2 meses', () => {
    const faixa = { operador: 'ENTRE' as const, alvo: 1, alvoMax: 2, toleranciaPct: 5 }
    expect(classificar(1.5, faixa)).toBe('VERDE')
    expect(classificar(0.96, faixa)).toBe('AMARELO')
    expect(classificar(2.1, faixa)).toBe('AMARELO')
    expect(classificar(2.2, faixa)).toBe('VERMELHO')
    expect(classificar(0.5, faixa)).toBe('VERMELHO')
  })
  it('tolerância configurável', () => {
    expect(classificar(93, { ...maiorIgual95, toleranciaPct: 1 })).toBe('VERMELHO')
    expect(classificar(93, { ...maiorIgual95, toleranciaPct: 10 })).toBe('AMARELO')
  })
  it('contagem mínima (>= 120)', () => {
    const m = { operador: '>=' as const, alvo: 120, toleranciaPct: 5 }
    expect(classificar(131, m)).toBe('VERDE')
    expect(classificar(114, m)).toBe('AMARELO')
    expect(classificar(113, m)).toBe('VERMELHO')
  })
  it('tendência de queda', () => {
    expect(classificarTendencia([30, 25, 20, 18, 15, 10], 'QUEDA')).toBe('VERDE')
    expect(classificarTendencia([10, 12, 15, 30, 40, 63], 'QUEDA')).toBe('VERMELHO')
    expect(classificarTendencia([10, 10, 10], 'QUEDA')).toBe('AMARELO')
    expect(classificarTendencia([10, null], 'QUEDA')).toBe('NA')
  })
  it('descrição da meta em pt-BR', () => {
    expect(descreverMeta(maiorIgual95, '%')).toBe('≥ 95%')
    expect(descreverMeta({ operador: '<=', alvo: 8, toleranciaPct: 5 }, 'por 100 equip')).toBe('≤ 8 por 100 equip')
    expect(descreverMeta({ operador: '>=', alvo: 99.5, toleranciaPct: 5 }, '%', 2)).toBe('≥ 99,5%')
  })
})
