/**
 * Conferência de valores conhecidos da planilha REAL (contém dados pessoais:
 * nunca versionar). Executado somente quando PLANILHA_REAL aponta para o arquivo.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { analisarPlanilha, type AnalisePlanilha } from '@/lib/importacao/planilha'

const arquivo = process.env.PLANILHA_REAL

describe.skipIf(!arquivo)('planilha real (PLANILHA_REAL)', () => {
  let a: AnalisePlanilha
  beforeAll(async () => {
    a = await analisarPlanilha(readFileSync(arquivo!), 'planilha-real.xlsx')
  })
  const soma = (serie: string, comp: string) => a.series.filter((s) => s.serie === serie && s.competencia === comp).reduce((t, s) => t + s.valor, 0)

  it('manutenção interna', () => {
    expect(soma('MI_RECUPERADOS', '2026-07-01')).toBe(131)
    expect(soma('MI_RECUPERADOS', '2026-06-01')).toBe(160)
    expect(soma('MI_SUCATEADOS', '2026-07-01')).toBe(63)
  })

  it('manutenção externa', () => {
    expect(soma('ME_REINCIDENCIAS', '2026-07-01')).toBe(17)
    expect(soma('ME_ATENDIMENTOS', '2026-07-01')).toBe(360)
    expect(soma('ME_DESNECESSARIOS', '2026-07-01')).toBe(29)
    expect(soma('ME_NECESSARIOS', '2026-07-01')).toBe(343)
    expect(soma('ME_CHAMADOS', '2026-07-01')).toBe(417)
    expect(a.trocas).toHaveLength(77)
  })

  it('entregas e retiradas de comodato', () => {
    expect(soma('CO_ENTREGAS', '2026-07-01')).toBe(87)
    expect(soma('CO_TROCAS', '2026-07-01')).toBe(88)
    expect(soma('CO_RETIRADAS', '2026-07-01')).toBe(38)
  })

  it('estoque de comodato de julho (FORNO)', () => {
    const f = a.posicoesComodato.find((p) => p.competencia === '2026-07-01' && p.produto === 'FORNO')!
    expect(f).toMatchObject({ posicaoAnterior: 207, entradas: 14, saidasNovos: 22, saidasUsados: 17, atual: 182, ajuste: 0 })
  })

  it('chamados de TI e quadro-resumo', () => {
    expect(a.chamadosTi.filter((c) => c.sistemaOrigem === 'TI')).toHaveLength(146)
    expect(a.chamadosTi.filter((c) => c.sistemaOrigem === 'LINEAR')).toHaveLength(250)
    const resumo = a.totaisConferidos.filter((t) => t.aba === 'T.I')
    expect(resumo.filter((t) => !t.confere)).toEqual([])
    expect(a.chamadosTi.filter((c) => c.dadoTeste)).toHaveLength(1)
  })
})
