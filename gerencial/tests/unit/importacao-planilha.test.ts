import { beforeAll, describe, expect, it } from 'vitest'
import { analisarPlanilha, dataHoraSaoPaulo, ehChamadoTeste, horasDeTexto, normalizarStatusTi, type AnalisePlanilha } from '@/lib/importacao/planilha'
import { resolverFamilia, CATALOGO_FAMILIAS_PADRAO } from '@/lib/importacao/familias'
import { gerarPlanilhaSintetica } from '../fixtures/gerarPlanilhaSintetica'

let limpa: AnalisePlanilha
let divergente: AnalisePlanilha

beforeAll(async () => {
  limpa = await analisarPlanilha(await gerarPlanilhaSintetica(), 'sintetica.xlsx')
  divergente = await analisarPlanilha(await gerarPlanilhaSintetica({ divergencias: true }), 'sintetica-divergente.xlsx')
})

const serie = (a: AnalisePlanilha, s: string, comp: string, dim?: string) =>
  a.series.filter((x) => x.serie === s && x.competencia === comp && (dim === undefined || x.dimensaoValor === dim))
const somaSerie = (a: AnalisePlanilha, s: string, comp: string) => serie(a, s, comp).reduce((t, x) => t + x.valor, 0)
const pend = (a: AnalisePlanilha, tipo: string) => a.pendencias.filter((p) => p.tipo === tipo)

describe('séries mensais', () => {
  it('lê os valores por família, técnico, rede e resumo', () => {
    expect(somaSerie(limpa, 'MI_RECUPERADOS', '2026-07-01')).toBe(131)
    expect(somaSerie(limpa, 'MI_SUCATEADOS', '2026-07-01')).toBe(63)
    expect(somaSerie(limpa, 'ME_ATENDIMENTOS', '2026-07-01')).toBe(34 + 55 + 37 + 53)
    expect(somaSerie(limpa, 'ME_CHAMADOS_REDE', '2026-08-01')).toBe(48)
    expect(serie(limpa, 'ME_DESNECESSARIOS', '2026-07-01')[0].valor).toBe(2)
    expect(serie(limpa, 'ME_NECESSARIOS', '2026-07-01')[0].valor).toBe(343)
    expect(serie(limpa, 'CO_ENTREGAS', '2026-07-01')[0].valor).toBe(87)
    expect(serie(limpa, 'EP_ENTRADA_RS', '2026-04-01', 'CONTROLADORES')[0].valor).toBeCloseTo(8533.38)
    expect(serie(limpa, 'ME_TROCAS_QTD', '2026-04-01')[0].valor).toBe(2)
    const cli = serie(limpa, 'ME_CHAMADOS_CLIENTE', '2026-01-01')
    expect(cli.map((c) => c.dimensaoValor)).toEqual(['CLIENTE ALFA', 'CLIENTE BETA'])
  })

  it('guarda a origem (aba/célula) e a dimensão', () => {
    const forno = serie(limpa, 'MI_RECUPERADOS', '2026-07-01', 'FORNO')[0]
    expect(forno).toMatchObject({ aba: 'Equipe Interna', celula: 'H7', dimensaoTipo: 'FAMILIA_EQUIP', area: 'MANUT_INTERNA', valor: 41 })
    expect(serie(limpa, 'ME_ATENDIMENTOS', '2026-07-01', 'TERCEIRO')[0].dimensaoTipo).toBe('TECNICO')
  })

  it('célula vazia não vira zero; zero explícito é importado', () => {
    expect(serie(limpa, 'MI_RECUPERADOS', '2026-03-01', 'FORNO')).toHaveLength(0)
    expect(serie(limpa, 'MI_RECUPERADOS', '2026-02-01', 'MINI CAMARA')[0].valor).toBe(0)
    expect(serie(limpa, 'ME_CHAMADOS_REDE', '2026-07-01', 'ASSAI')).toHaveLength(0)
    expect(serie(limpa, 'ME_CHAMADOS_REDE', '2026-08-01', 'DIA')[0].valor).toBe(0)
    expect(limpa.series.some((s) => s.dimensaoValor === 'MRP')).toBe(false)
    expect(serie(limpa, 'MI_RECUPERADOS', '2026-09-01')).toHaveLength(0)
    expect(serie(limpa, 'CO_FIM_ANO', '2026-10-01')[0].valor).toBe(0)
  })

  it('não importa fórmulas nem quadros de estimativa como dado', () => {
    const matriciais = limpa.series.filter((s) => s.dimensaoTipo !== 'CLIENTE')
    expect(matriciais.some((s) => /^[NOQRST]\d+$/.test(s.celula))).toBe(false)
    const est = pend(limpa, 'DIVERGENCIA_FONTE').filter((p) => /Estimativa/.test(p.descricao))
    expect(est.map((p) => p.celula)).toEqual(['Q3:S10', 'Q15:S23'])
  })
})

describe('fórmulas e totais', () => {
  it('fixture limpa: todos os totais e médias conferem', () => {
    expect(limpa.totaisConferidos.length).toBeGreaterThan(50)
    expect(limpa.totaisConferidos.filter((t) => !t.confere)).toEqual([])
    expect(pend(limpa, 'TOTAL_INCOMPATIVEL')).toHaveLength(0)
  })

  it('média da rede com fórmula AVERAGE(B+C+...) vira uma única pendência FORMULA_INVALIDA', () => {
    const f = pend(limpa, 'FORMULA_INVALIDA')
    expect(f).toHaveLength(1)
    expect(f[0].aba).toBe('Equipe Externa')
    expect(f[0].descricao).toMatch(/rede/)
  })

  it('detecta totais com cache divergente', () => {
    const t = pend(divergente, 'TOTAL_INCOMPATIVEL')
    const est = t.find((p) => p.aba === 'Estoque' && p.celula === 'B6')
    expect(est?.descricao).toMatch(/planilha 500 x recalculado 0/)
    expect(t.some((p) => p.aba === 'Equipe Externa' && /TOTAL de 2026-07/.test(p.descricao))).toBe(true)
    expect(t.some((p) => /equipamento do cliente/i.test(p.descricao))).toBe(true)
    expect(t.some((p) => p.aba === 'T.I' && /Chamados TI/.test(p.descricao))).toBe(true)
  })

  it('confere contagens de listas contra os resumos mensais', () => {
    const trocas = limpa.totaisConferidos.filter((t) => /Trocas listadas/.test(t.descricao))
    expect(trocas).toHaveLength(8)
    expect(trocas.every((t) => t.confere)).toBe(true)
  })
})

describe('detalhes e trocas', () => {
  it('importa chamados desnecessários e manutenções de equipamento do cliente com solicitante em dados', () => {
    const d = limpa.detalhes.filter((x) => x.tipo === 'DESNECESSARIO')
    expect(d).toHaveLength(10)
    expect(d[0].dados).toMatchObject({ fantasia: 'LOJA FICTICIA 1-1', motivo: 'EQUIPAMENTO NAO LIGA' })
    expect(d[0].dados.solicitante).toBeTruthy()
    const e = limpa.detalhes.filter((x) => x.tipo === 'EQUIP_CLIENTE')
    expect(e).toHaveLength(6)
    expect(typeof e[0].dados.valor).toBe('number')
  })

  it('normaliza trocas: status, linha e competência da solicitação', () => {
    expect(limpa.trocas).toHaveLength(6)
    const pendente = limpa.trocas.find((t) => t.clienteTexto === 'LOJA TROCA 5')!
    expect(pendente).toMatchObject({ status: 'PENDENTE', dataTroca: null, competencia: '2026-07-01' })
    const star = limpa.trocas.find((t) => t.clienteTexto === 'LOJA TROCA 4')!
    expect(star).toMatchObject({ status: 'CONCLUIDA', linha: 'STAR', dataTroca: '2026-07-03' })
  })
})

describe('mapeamento de famílias', () => {
  it('propõe ARMARIO/ESQUELETO para linhas separadas, sem fundir silenciosamente', () => {
    const arm = limpa.propostasMapeamento.find((p) => p.chave === 'ARMARIO')!
    expect(arm).toMatchObject({ sugestao: 'ARMARIO/ESQUELETO', acao: 'ALIAS', criarAlias: true })
    expect(limpa.propostasMapeamento.find((p) => p.chave === 'ESQUELETO')?.sugestao).toBe('ARMARIO/ESQUELETO')
    expect(serie(limpa, 'MI_SUCATEADOS', '2026-07-01', 'ARMARIO')[0].valor).toBe(48)
    expect(serie(limpa, 'MI_SUCATEADOS', '2026-07-01', 'ESQUELETO')[0].valor).toBe(0)
    expect(pend(limpa, 'SEM_MAPEAMENTO').some((p) => /"ARMARIO"/.test(p.descricao))).toBe(true)
  })

  it('reconhece sinônimos e marca textos ambíguos para decisão manual', () => {
    expect(limpa.familiasResolvidas.CLIMATICA).toBe('CLIMATIZADORA')
    expect(limpa.familiasResolvidas.FONRO).toBe('FORNO')
    expect(limpa.familiasResolvidas['TELA / BANDEJA'] ?? 'TELA/BANDEJA').toBe('TELA/BANDEJA')
    expect(limpa.propostasMapeamento.find((p) => p.chave === 'FORNO E FREEZER')?.acao).toBe('MANUAL')
    expect(resolverFamilia('6 ARMARIO 58X70', CATALOGO_FAMILIAS_PADRAO)).toEqual({ familia: 'ARMARIO/ESQUELETO', modo: 'HEURISTICA' })
    expect(resolverFamilia('TELA  / BANDEJA', CATALOGO_FAMILIAS_PADRAO).familia).toBe('TELA/BANDEJA')
  })
})

describe('estoque de comodato', () => {
  it('lê as posições e registra ajuste quando a planilha não fecha', () => {
    const forno = limpa.posicoesComodato.find((p) => p.competencia === '2026-07-01' && p.produto === 'FORNO')!
    expect(forno).toMatchObject({ posicaoAnterior: 207, entradas: 14, saidasNovos: 22, saidasUsados: 17, novos: 155, usados: 27, atual: 182, ajuste: 0 })
    const fz = limpa.posicoesComodato.find((p) => p.competencia === '2026-08-01' && p.produto === 'FREEZER')!
    expect(fz.ajuste).toBe(1)
    expect(fz.justificativaAjuste).toMatch(/Diferença histórica/)
    expect(fz.posicaoAnterior + fz.entradas - fz.saidasNovos - fz.saidasUsados + fz.ajuste).toBe(fz.novos + fz.usados)
    const conc = pend(limpa, 'CONCILIACAO')
    expect(conc).toHaveLength(1)
    expect(conc[0].descricao).toMatch(/FREEZER 2026-08/)
  })

  it('confere a posição anterior com o mês anterior mesmo com nome de produto diferente', () => {
    expect(pend(limpa, 'CONCILIACAO').some((p) => /MINI CAMARA/.test(p.descricao))).toBe(false)
  })
})

describe('T.I', () => {
  it('converte datas de São Paulo (-03:00) e horas em texto', () => {
    expect(dataHoraSaoPaulo('31/08/2026, 16:58:10')).toBe('2026-08-31T16:58:10-03:00')
    expect(horasDeTexto('16.1h')).toBe(16.1)
    expect(horasDeTexto('-4h')).toBe(-4)
    expect(horasDeTexto('+12.5h')).toBe(12.5)
    const c = limpa.chamadosTi.find((x) => x.numero === 'TI-2026080001')!
    expect(c).toMatchObject({ abertoEm: '2026-08-31T16:58:10-03:00', fechadoEm: '2026-09-01T09:02:02-03:00', competencia: '2026-08-01', tempoResolucaoOrigemH: 16.1, slaDesvioH: -4, slaViolado: false, statusNormalizado: 'RESOLVIDO', sistemaOrigem: 'TI' })
    expect(c.tags).toEqual(['rede', 'impressora'])
    expect(new Date(c.abertoEm).toISOString()).toBe('2026-08-31T19:58:10.000Z')
  })

  it('separa dados restritos (e-mail, ramal, IP) do chamado', () => {
    const c = limpa.chamadosTi.find((x) => x.numero === 'TI-2026080001')!
    const { restrito, ...publico } = c
    expect(JSON.stringify(publico)).not.toMatch(/@|192\.0\.2|0000-0000/)
    expect(restrito).toMatchObject({ emailTecnico: 'tecnico.ficticio@exemplo.test', emailSolicitante: 'solicitante.ficticio@exemplo.test', ramal: '(11) 0000-0000', ipAbertura: '192.0.2.1', fechadoPorEmail: 'tecnico.ficticio@exemplo.test' })
  })

  it('identifica origem Linear e normaliza status', () => {
    expect(limpa.chamadosTi.filter((c) => c.sistemaOrigem === 'LINEAR').map((c) => c.statusNormalizado)).toEqual(['RESOLVIDO', 'ABERTO', 'EM_ATENDIMENTO'])
    expect(normalizarStatusTi('Aguardando Usuário')).toBe('AGUARDANDO')
    expect(normalizarStatusTi('Canceled')).toBe('CANCELADO')
    expect(normalizarStatusTi('Status inventado')).toBeNull()
  })

  it('marca chamados de teste e duplicidades', () => {
    expect(ehChamadoTeste('testewvwcdwcww')).toBe(true)
    expect(ehChamadoTeste('Teste de regressão no homolog')).toBe(false)
    expect(limpa.chamadosTi.find((c) => c.numero === 'TI-2026080003')?.dadoTeste).toBe(true)
    expect(pend(limpa, 'DADO_TESTE')).toHaveLength(1)
    expect(pend(limpa, 'DUPLICIDADE')).toHaveLength(0)
    expect(pend(divergente, 'DUPLICIDADE').filter((p) => p.aba === 'T.I')).toHaveLength(1)
    expect(divergente.chamadosTi).toHaveLength(9)
  })

  it('confere o quadro-resumo (tempo médio sobre chamados resolvidos)', () => {
    const t = limpa.totaisConferidos.find((x) => /Tempo médio/.test(x.descricao))!
    expect(t).toMatchObject({ valorPlanilha: 17.7, valorCalculado: 17.7, confere: true })
  })
})

describe('conteúdo não mapeado', () => {
  it('vira pendência SEM_MAPEAMENTO e o esboço de tabela dinâmica vira INFORMATIVO', () => {
    const sm = pend(limpa, 'SEM_MAPEAMENTO').filter((p) => p.aba === 'T.I')
    expect(sm.map((p) => p.celula)).toEqual(['F2:G4'])
    expect(pend(limpa, 'INFORMATIVO')).toHaveLength(1)
    expect(pend(limpa, 'SEM_MAPEAMENTO').some((p) => p.aba === 'Equipe Interna' && /Conteúdo sem mapeamento/.test(p.descricao))).toBe(false)
  })
})
