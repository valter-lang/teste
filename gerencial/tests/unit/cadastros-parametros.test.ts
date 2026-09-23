import { describe, expect, it } from 'vitest'
import { PARAMETROS, validarExpediente, validarParametro, exibirParametro, parametroPorChave } from '@/lib/cadastros/parametros'

describe('validação de parâmetros de configuração', () => {
  it('conhece todas as chaves do seed', () => {
    for (const k of ['migracao.data_corte', 'manut_externa.janela_reincidencia_dias', 'manut_externa.sla_primeira_resposta_horas_uteis',
      'semaforo.tolerancia_padrao_pct', 'ti.backlog_dias_uteis', 'ranking.volume_minimo', 'privacidade.anonimizar_nomes_diretoria',
      'fechamento.areas_obrigatorias', 'relatorio.fonte_exportacao']) expect(parametroPorChave(k)).toBeDefined()
  })
  it('padrões atendem ao próprio esquema', () => {
    for (const p of PARAMETROS) expect(p.esquema.safeParse(p.padrao).success).toBe(true)
  })
  it('data de corte deve ser primeiro dia do mês', () => {
    expect(validarParametro('migracao.data_corte', { valor: '2026-09-15' }).ok).toBe(false)
    expect(validarParametro('migracao.data_corte', { valor: '2026-10-01' })).toEqual({ ok: true, valor: '2026-10-01' })
  })
  it('janela de reincidência aceita vazio (nulo) e inteiros positivos', () => {
    expect(validarParametro('manut_externa.janela_reincidencia_dias', { valor: '' })).toEqual({ ok: true, valor: null })
    expect(validarParametro('manut_externa.janela_reincidencia_dias', { valor: '30' })).toEqual({ ok: true, valor: 30 })
    expect(validarParametro('manut_externa.janela_reincidencia_dias', { valor: '0' }).ok).toBe(false)
    expect(validarParametro('manut_externa.janela_reincidencia_dias', { valor: '2.5' }).ok).toBe(false)
  })
  it('inteiros e decimais com limites', () => {
    expect(validarParametro('ti.backlog_dias_uteis', { valor: 'abc' }).ok).toBe(false)
    expect(validarParametro('ti.backlog_dias_uteis', { valor: '' }).ok).toBe(false)
    expect(validarParametro('semaforo.tolerancia_padrao_pct', { valor: '7,5' })).toEqual({ ok: true, valor: 7.5 })
    expect(validarParametro('semaforo.tolerancia_padrao_pct', { valor: '80' }).ok).toBe(false)
  })
  it('booleano, opção, áreas e lista', () => {
    expect(validarParametro('privacidade.anonimizar_nomes_diretoria', { valor: 'true' })).toEqual({ ok: true, valor: true })
    expect(validarParametro('relatorio.fonte_exportacao', { valor: 'COMIC' }).ok).toBe(false)
    expect(validarParametro('fechamento.areas_obrigatorias', { valores: [] }).ok).toBe(false)
    expect(validarParametro('fechamento.areas_obrigatorias', { valores: ['TI', 'TI', 'COMODATO'] })).toEqual({ ok: true, valor: ['TI', 'COMODATO'] })
    expect(validarParametro('fechamento.areas_obrigatorias', { valores: ['RH'] }).ok).toBe(false)
    expect(validarParametro('integracao.base_instalada.status_ativos', { valor: '01, x1;02' })).toEqual({ ok: true, valor: ['01', 'X1', '02'] })
    expect(validarParametro('integracao.base_instalada.status_ativos', { valor: '' }).ok).toBe(false)
  })
  it('recusa chave desconhecida', () => {
    expect(validarParametro('qualquer.coisa', { valor: '1' }).ok).toBe(false)
  })
  it('exibe valores formatados', () => {
    expect(exibirParametro(parametroPorChave('migracao.data_corte')!, '2026-09-01')).toBe('01/09/2026')
    expect(exibirParametro(parametroPorChave('manut_externa.janela_reincidencia_dias')!, null)).toBe('Não definido')
  })
})

describe('expediente oficial', () => {
  it('valida fuso, dias e horário', () => {
    expect(validarExpediente({ fuso: 'America/Sao_Paulo', dias: ['5', '1', '3'], inicio: '08:00', fim: '18:00' }))
      .toEqual({ ok: true, valor: { fuso: 'America/Sao_Paulo', dias_uteis: [1, 3, 5], inicio: '08:00', fim: '18:00' } })
    expect(validarExpediente({ fuso: 'Marte/Base', dias: ['1'], inicio: '08:00', fim: '18:00' }).ok).toBe(false)
    expect(validarExpediente({ fuso: 'America/Sao_Paulo', dias: [], inicio: '08:00', fim: '18:00' }).ok).toBe(false)
    expect(validarExpediente({ fuso: 'America/Sao_Paulo', dias: ['1'], inicio: '18:00', fim: '08:00' }).ok).toBe(false)
    expect(validarExpediente({ fuso: 'America/Sao_Paulo', dias: ['9'], inicio: '08:00', fim: '18:00' }).ok).toBe(false)
  })
})
