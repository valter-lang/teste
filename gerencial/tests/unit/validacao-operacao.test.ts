import { describe, expect, it } from 'vitest'
import { competenciaIso, dataHoraIso, dataIso, errosPorCampo, numeroBr, booleano } from '@/lib/validacao/comum'
import { manutInternaSchema, validarPecas } from '@/lib/validacao/manutencao-interna'
import { chamadoExternoSchema, solicitacaoTrocaSchema } from '@/lib/validacao/manutencao-externa'
import { movimentoEstoqueSchema } from '@/lib/validacao/estoque'
import { comodatoMovimentoSchema, comodatoPosicaoSchema, comodatoTentativaSchema } from '@/lib/validacao/comodato'
import { chamadoTiSchema, incidenteCriticoSchema, marcoSchema, patchCicloSchema, desvioDias, indisponibilidadeSchema } from '@/lib/validacao/ti'
import type { z } from 'zod'

function erros(schema: z.ZodType, entrada: Record<string, string>) {
  const r = schema.safeParse(entrada)
  return r.success ? {} : errosPorCampo(r.error.issues)
}
function ok<T>(schema: z.ZodType<T>, entrada: Record<string, string>): T {
  const r = schema.safeParse(entrada)
  if (!r.success) throw new Error(JSON.stringify(errosPorCampo(r.error.issues)))
  return r.data
}

describe('conversores pt-BR', () => {
  it('números', () => {
    expect(numeroBr('1.234,56')).toBe(1234.56)
    expect(numeroBr('10,5')).toBe(10.5)
    expect(numeroBr('10.5')).toBe(10.5)
    expect(numeroBr('R$ 1.000,00')).toBe(1000)
    expect(numeroBr('-3')).toBe(-3)
    expect(() => numeroBr('abc')).toThrow()
  })
  it('datas e competências', () => {
    expect(dataIso('05/01/2026')).toBe('2026-01-05')
    expect(dataIso('2026-01-05')).toBe('2026-01-05')
    expect(() => dataIso('31/02/2026')).toThrow()
    expect(competenciaIso('07/2026')).toBe('2026-07-01')
    expect(competenciaIso('2026-07')).toBe('2026-07-01')
    expect(competenciaIso('jul/26')).toBe('2026-07-01')
    expect(() => competenciaIso('13/2026')).toThrow()
  })
  it('data e hora no fuso de Brasília', () => {
    const iso = dataHoraIso('01/09/2026 00:30')
    expect(iso.startsWith('2026-09-01T00:30')).toBe(true)
    expect(new Date(iso).toISOString()).toBe('2026-09-01T03:30:00.000Z')
    expect(dataHoraIso('2026-09-01T08:00').startsWith('2026-09-01T08:00')).toBe(true)
  })
  it('booleanos', () => {
    expect(booleano('Sim')).toBe(true)
    expect(booleano('não')).toBe(false)
    expect(() => booleano('talvez')).toThrow()
  })
})

describe('manutenção interna', () => {
  const base = { familia_id: '1', tipo_servico: 'Recuperação', resultado: 'RECUPERADO', data_recebimento: '2026-08-10', data_conclusao: '2026-09-02' }
  it('deriva a competência da conclusão e aceita rótulos', () => {
    const d = ok(manutInternaSchema, base)
    expect(d.competencia).toBe('2026-09-01')
    expect(d.tipo_servico).toBe('RECUPERACAO')
  })
  it('campos obrigatórios', () => {
    const e = erros(manutInternaSchema, {})
    expect(e.familia_id).toBe('Campo obrigatório')
    expect(e.tipo_servico).toBe('Campo obrigatório')
    expect(e.resultado).toBe('Campo obrigatório')
  })
  it('recebimento ≤ conclusão', () => {
    expect(erros(manutInternaSchema, { ...base, data_conclusao: '2026-08-01' }).data_conclusao).toMatch(/anterior ao recebimento/)
  })
  it('sucateado exige motivo', () => {
    expect(erros(manutInternaSchema, { ...base, resultado: 'SUCATEADO' }).motivo_sucateamento).toBeTruthy()
    expect(ok(manutInternaSchema, { ...base, resultado: 'SUCATEADO', motivo_sucateamento: 'Compressor queimado' }).resultado).toBe('SUCATEADO')
  })
  it('competência precisa corresponder ao mês da conclusão', () => {
    expect(erros(manutInternaSchema, { ...base, competencia: '2026-08' }).competencia).toMatch(/deve corresponder/)
  })
  it('peças: linhas inválidas são reportadas', () => {
    const r = validarPecas(JSON.stringify([{ familia_id: '1', quantidade: '2' }, { familia_id: '', quantidade: '-1' }, {}]))
    expect(r.linhas).toHaveLength(1)
    expect(r.erros[0]).toMatch(/Peça 2/)
  })
})

describe('manutenção externa', () => {
  const base = { numero: 'CH-1', aberto_em: '2026-09-01T08:00' }
  it('abertura ≤ 1ª resposta ≤ encerramento', () => {
    expect(erros(chamadoExternoSchema, { ...base, primeira_resposta_em: '2026-08-31T08:00' }).primeira_resposta_em).toBeTruthy()
    expect(erros(chamadoExternoSchema, { ...base, primeira_resposta_em: '2026-09-02T08:00', encerrado_em: '2026-09-01T09:00' }).encerrado_em).toBeTruthy()
    expect(ok(chamadoExternoSchema, { ...base, primeira_resposta_em: '2026-09-01T09:00', encerrado_em: '2026-09-02T09:00', status: 'ENCERRADO' }).status).toBe('ENCERRADO')
  })
  it('desnecessário exige motivo e justificativa', () => {
    const e = erros(chamadoExternoSchema, { ...base, necessario: 'Não' })
    expect(e.justificativa_desnecessario).toMatch(/justificativa/)
    expect(e.motivo_desnecessario).toBeTruthy()
    expect(ok(chamadoExternoSchema, { ...base, necessario: 'false', motivo_desnecessario: 'Sem defeito', justificativa_desnecessario: 'Equipamento ok' }).motivo_desnecessario).toBe('SEM_DEFEITO')
  })
  it('SLA inelegível exige motivo', () => {
    expect(erros(chamadoExternoSchema, { ...base, elegivel_sla: 'false' }).motivo_inelegivel_sla).toBeTruthy()
  })
  it('reincidência exige o chamado anterior', () => {
    expect(erros(chamadoExternoSchema, { ...base, reincidencia: 'true' }).chamado_anterior_numero).toMatch(/vincular/)
  })
  it('equipamento parado força P1', () => {
    expect(ok(chamadoExternoSchema, { ...base, equipamento_parado: 'Sim', criticidade: 'P3' }).criticidade).toBe('P1')
  })
  it('competência pelo mês local da abertura (00:30 de 01/09 é setembro)', () => {
    expect(ok(chamadoExternoSchema, { numero: 'X', aberto_em: '01/09/2026 00:30' }).competencia).toBe('2026-09-01')
    expect(erros(chamadoExternoSchema, { numero: 'X', aberto_em: '01/09/2026 00:30', competencia: '2026-08' }).competencia).toBeTruthy()
  })
  it('troca: solicitação ≤ troca; concluída exige data; cliente obrigatório', () => {
    const e = erros(solicitacaoTrocaSchema, { data_solicitacao: '2026-09-10', data_troca: '2026-09-01', status: 'CONCLUIDA' })
    expect(e.data_troca).toBeTruthy()
    expect(e.cliente_id).toBeTruthy()
    expect(erros(solicitacaoTrocaSchema, { data_solicitacao: '2026-09-10', status: 'Concluída', cliente_texto: 'Padaria' }).data_troca).toMatch(/exige/)
  })
})

describe('estoque', () => {
  const base = { data: '2026-09-15', tipo: 'SAIDA', familia_id: '1', quantidade: '2' }
  it('competência deve ser o mês da data', () => {
    expect(ok(movimentoEstoqueSchema, base).competencia).toBe('2026-09-01')
    expect(erros(movimentoEstoqueSchema, { ...base, competencia: '08/2026' }).competencia).toBeTruthy()
  })
  it('quantidade/custo negativos só em ajuste justificado', () => {
    expect(erros(movimentoEstoqueSchema, { ...base, quantidade: '-2' }).quantidade).toBeTruthy()
    expect(erros(movimentoEstoqueSchema, { ...base, valor_total: '-1' }).valor_total).toBeTruthy()
    expect(erros(movimentoEstoqueSchema, { ...base, tipo: 'AJUSTE', quantidade: '-2' }).justificativa_ajuste).toBeTruthy()
    expect(ok(movimentoEstoqueSchema, { ...base, tipo: 'Ajuste', quantidade: '-2', justificativa_ajuste: 'Inventário' }).quantidade).toBe(-2)
  })
  it('transferência exige destino diferente da origem', () => {
    expect(erros(movimentoEstoqueSchema, { ...base, tipo: 'TRANSFERENCIA' }).local_destino_id).toBeTruthy()
    expect(erros(movimentoEstoqueSchema, { ...base, tipo: 'TRANSFERENCIA', local_estoque_id: '1', local_destino_id: '1' }).local_destino_id).toBeTruthy()
  })
})

describe('comodato', () => {
  it('solicitação ≤ agendamento/conclusão; concluído exige data; sem êxito exige motivo', () => {
    const b = { tipo: 'ENTREGA', data_solicitacao: '2026-09-10', cliente_texto: 'Cliente' }
    expect(erros(comodatoMovimentoSchema, { ...b, data_agendamento: '2026-09-01' }).data_agendamento).toBeTruthy()
    expect(erros(comodatoMovimentoSchema, { ...b, situacao: 'CONCLUIDO' }).data_conclusao).toBeTruthy()
    expect(erros(comodatoMovimentoSchema, { ...b, situacao: 'Sem êxito' }).motivo_insucesso).toBeTruthy()
  })
  it('tentativa sem sucesso exige motivo', () => {
    expect(erros(comodatoTentativaSchema, { data: '2026-09-10', sucesso: 'false' }).motivo_insucesso).toBeTruthy()
    expect(ok(comodatoTentativaSchema, { data: '2026-09-10', sucesso: 'true' }).competencia).toBe('2026-09-01')
  })
  it('posição concilia ou exige ajuste justificado', () => {
    const b = { competencia: '2026-09', produto: 'Freezer', posicao_anterior: '10', entradas: '5', saidas_novos: '2', saidas_usados: '1', novos: '8', usados: '4' }
    expect(ok(comodatoPosicaoSchema, b).novos).toBe(8)
    expect(erros(comodatoPosicaoSchema, { ...b, usados: '5' }).ajuste).toMatch(/Não concilia/)
    expect(erros(comodatoPosicaoSchema, { ...b, usados: '5', ajuste: '1' }).justificativa_ajuste).toBeTruthy()
    expect(ok(comodatoPosicaoSchema, { ...b, usados: '5', ajuste: '1', justificativa_ajuste: 'Recontagem' }).ajuste).toBe(1)
  })
})

describe('TI', () => {
  it('chamado: fechamento ≥ abertura; resolvido exige fechamento; status padrão', () => {
    const b = { numero: '1', status_normalizado: 'RESOLVIDO', aberto_em: '2026-09-01T08:00' }
    expect(erros(chamadoTiSchema, b).fechado_em).toBeTruthy()
    expect(erros(chamadoTiSchema, { ...b, fechado_em: '2026-08-31T08:00' }).fechado_em).toBeTruthy()
    const d = ok(chamadoTiSchema, { ...b, fechado_em: '2026-09-01T10:00', tags: 'rede, vpn' })
    expect(d.status).toBe('Resolvido')
    expect(d.tags).toEqual(['rede', 'vpn'])
  })
  it('incidente com causa tratada exige causa, ação e responsável', () => {
    const e = erros(incidenteCriticoSchema, { aberto_em: '2026-09-01T08:00', resolvido_em: '2026-09-01T10:00', descricao: 'Queda', status: 'CAUSA_TRATADA' })
    expect(e.causa_raiz && e.acao_corretiva && e.responsavel).toBeTruthy()
  })
  it('indisponibilidade inválida exige motivo', () => {
    expect(erros(indisponibilidadeSchema, { sistema_id: '1', inicio: '2026-09-01T08:00', valida: 'false' }).motivo_invalidacao).toBeTruthy()
  })
  it('marco: competência = mês planejado; desvio em dias', () => {
    expect(ok(marcoSchema, { projeto_id: '1', descricao: 'Go-live', data_planejada: '2026-09-20' }).competencia).toBe('2026-09-01')
    expect(erros(marcoSchema, { projeto_id: '1', descricao: 'Go-live', data_planejada: '2026-09-20', competencia: '2026-10' }).competencia).toBeTruthy()
    expect(desvioDias('2026-09-20', '2026-09-25', '2026-10-01')).toBe(5)
    expect(desvioDias('2026-09-20', null, '2026-09-22')).toBe(2)
    expect(desvioDias('2026-09-20', null, '2026-09-10')).toBe(0)
  })
  it('patches aplicados não excedem liberados', () => {
    expect(erros(patchCicloSchema, { competencia: '2026-09', patches_criticos_liberados: '3', aplicados_ate_30_dias: '4' }).aplicados_ate_30_dias).toBeTruthy()
  })
})
