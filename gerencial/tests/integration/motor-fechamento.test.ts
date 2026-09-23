/**
 * Integração do motor de indicadores e do fluxo de fechamento contra PostgreSQL real.
 * DATABASE_URL deve apontar para um banco de teste migrado e com seed (ex.: gerencial_test).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1, tx } from '@/lib/db'
import { calcularIndicador } from '@/lib/indicadores/motor'
import { lerSerie } from '@/lib/indicadores/series'
import { transicionar, situacaoConsolidada, checklist } from '@/lib/fechamento'
import type { UsuarioSessao } from '@/lib/auth/permissoes'

let admin: UsuarioSessao, diretoria: UsuarioSessao, gestorTi: UsuarioSessao, lancadorMi: UsuarioSessao
let importacaoId: number

async function usuario(nome: string, papeis: [string, string | null][]): Promise<UsuarioSessao> {
  const r = await q1<{ id: string }>(`insert into usuario (nome, email, senha_hash, deve_trocar_senha) values ($1, $2, 'x', false) returning id`, [nome, `${nome.replace(/\W/g, '')}.${Date.now()}@teste.local`])
  for (const [p, a] of papeis) await q(`insert into usuario_papel (usuario_id, papel, area_codigo) values ($1,$2,$3)`, [r!.id, p, a])
  return { id: r!.id, nome, deveTrocarSenha: false, atribuicoes: papeis.map(([p, a]) => ({ papel: p as never, area: a as never, unidadeId: null })) }
}

async function limpar() {
  await q(`update configuracao set valor = '"2026-09-01"' where chave = 'migracao.data_corte'`)
  await q(`delete from indicador_resultado`)
  await q(`delete from periodo_evento`); await q(`delete from periodo_area`)
  await q(`delete from plano_acao_andamento`); await q(`delete from plano_acao`)
  await q(`delete from analise_item`); await q(`delete from declaracao_periodo`)
  await q(`delete from historico_agregado`); await q(`delete from importacao`)
  await q(`delete from chamado_ti`); await q(`delete from manut_interna`)
}

beforeAll(async () => {
  await limpar()
  admin = await usuario('Admin Teste', [['ADMIN', null]])
  diretoria = await usuario('Diretoria Teste', [['DIRETORIA', null]])
  gestorTi = await usuario('Gestor TI', [['GESTOR', 'TI']])
  lancadorMi = await usuario('Lancador MI', [['LANCADOR', 'MANUT_INTERNA']])
  const imp = await q1<{ id: number }>(`insert into importacao (arquivo_nome, arquivo_sha256, status) values ('teste.xlsx', 'abc', 'GRAVADA') returning id`)
  importacaoId = imp!.id
  const h = (serie: string, comp: string, valor: number, dim: string | null = null, area = 'MANUT_EXTERNA') =>
    q(`insert into historico_agregado (importacao_id, area_codigo, serie, dimensao_tipo, dimensao_valor, competencia, valor, aba, celula) values ($1,$2,$3,$4,$5,$6,$7,'Aba','A1')`,
      [importacaoId, area, serie, dim ? 'TECNICO' : null, dim, comp, valor])
  // Julho/26 conforme a planilha real: 17 reincidências em 360 atendimentos; 29 desnecessários e 343 necessários
  await h('ME_REINCIDENCIAS', '2026-07-01', 10, 'MATIAS'); await h('ME_REINCIDENCIAS', '2026-07-01', 7, 'ADRIANO')
  await h('ME_ATENDIMENTOS', '2026-07-01', 200, 'MATIAS'); await h('ME_ATENDIMENTOS', '2026-07-01', 160, 'ADRIANO')
  await h('ME_DESNECESSARIOS', '2026-07-01', 29); await h('ME_NECESSARIOS', '2026-07-01', 343)
  await h('ME_REINCIDENCIAS', '2026-06-01', 10); await h('ME_ATENDIMENTOS', '2026-06-01', 389)
  await h('ME_DESNECESSARIOS', '2026-06-01', 18); await h('ME_NECESSARIOS', '2026-06-01', 371)
  await h('MI_SUCATEADOS', '2026-07-01', 63, null, 'MANUT_INTERNA'); await h('MI_SUCATEADOS', '2026-06-01', 9, null, 'MANUT_INTERNA')
})

afterAll(async () => {
  await limpar()
  await pool().end()
})

describe('motor de indicadores', () => {
  it('reincidência de julho/26 = 4,72% (verde, meta ≤ 5%) a partir do histórico', async () => {
    const r = await calcularIndicador('ME_REINCIDENCIA', '2026-07-01', 'MES')
    expect(r.valor).toBeCloseTo(4.7222, 3)
    expect(r.numerador).toBe(17)
    expect(r.denominador).toBe(360)
    expect(r.status).toBe('VERDE')
    expect(r.fonte).toBe('HISTORICO')
    expect(r.valorAnterior).toBeCloseTo((10 / 389) * 100, 3)
  })
  it('chamados desnecessários julho/26 = 7,8% (vermelho, > 5,25%)', async () => {
    const r = await calcularIndicador('ME_DESNECESSARIOS', '2026-07-01', 'MES')
    expect(r.valor).toBeCloseTo(7.796, 2)
    expect(r.status).toBe('VERMELHO')
  })
  it('trimestre recalculado pelo total (não pela média dos percentuais)', async () => {
    // 3º tri até julho = só julho; 2º tri acumulado até junho = abril..junho (abril/maio sem dado => não informado)
    const t = await calcularIndicador('ME_REINCIDENCIA', '2026-07-01', 'TRIMESTRE')
    expect(t.valor).toBeCloseTo(4.7222, 3)
    const s = await calcularIndicador('ME_REINCIDENCIA', '2026-07-01', 'SEMESTRE')
    expect(s.valor).toBeCloseTo(4.7222, 3)
  })
  it('sucata julho/26 = 63 (vermelho, meta ≤ 20) e soma nunca preenche mês ausente com zero', async () => {
    const r = await calcularIndicador('MI_SUCATEADOS', '2026-07-01', 'MES')
    expect(r.valor).toBe(63)
    expect(r.status).toBe('VERMELHO')
    const ano = await calcularIndicador('MI_SUCATEADOS', '2026-07-01', 'ANO')
    expect(ano.situacao).toBe('NAO_INFORMADO')
    expect(ano.valor).toBeNull()
  })
  it('sem base ativa, chamados por 100 equipamentos é "não informado" (nunca zero)', async () => {
    const r = await calcularIndicador('ME_CHAMADOS_100EQ', '2026-07-01', 'MES')
    expect(r.situacao).toBe('NAO_INFORMADO')
    expect(r.status).toBe('NA')
  })
  it('após a data de corte usa lançamentos; área sem lançamento = não informado', async () => {
    const s = await lerSerie('MI_SUCATEADOS', ['2026-09-01'])
    expect(s.porMes['2026-09-01'].situacao).toBe('NAO_INFORMADO')
    const fam = await q1<{ id: number }>(`select id from familia_equipamento where nome = 'FORNO'`)
    await tx({ usuarioId: lancadorMi.id }, (db) => db.query(
      `insert into manut_interna (competencia, familia_id, tipo_servico, resultado, motivo_sucateamento) values ('2026-09-01', $1, 'RECUPERACAO', 'SUCATEADO', 'Carcaça comprometida'),
       ('2026-09-01', $1, 'RECUPERACAO', 'RECUPERADO', null)`, [fam!.id]))
    const r = await calcularIndicador('MI_SUCATEADOS', '2026-09-01', 'MES')
    expect(r.valor).toBe(1)
    expect(r.fonte).toBe('EVENTOS')
  })
  it('cache é invalidado quando os dados de origem mudam (auditoria)', async () => {
    const fam = await q1<{ id: number }>(`select id from familia_equipamento where nome = 'FREEZER'`)
    await tx({ usuarioId: lancadorMi.id }, (db) => db.query(`insert into manut_interna (competencia, familia_id, tipo_servico, resultado, motivo_sucateamento) values ('2026-09-01', $1, 'RECUPERACAO', 'SUCATEADO', 'Compressor queimado')`, [fam!.id]))
    const r = await calcularIndicador('MI_SUCATEADOS', '2026-09-01', 'MES')
    expect(r.valor).toBe(2)
  })
  it('P1 sem registro exige declaração do gestor; com declaração vira zero confirmado', async () => {
    let r = await calcularIndicador('TI_P1_SEM_CAUSA', '2026-09-01', 'MES')
    expect(r.situacao).toBe('NAO_INFORMADO')
    await tx({ usuarioId: gestorTi.id }, (db) => db.query(`insert into declaracao_periodo (competencia, area_codigo, chave, valor, declarado_por) values ('2026-09-01','TI','SEM_P1',true,$1)`, [gestorTi.id]))
    r = await calcularIndicador('TI_P1_SEM_CAUSA', '2026-09-01', 'MES')
    expect(r.valor).toBe(0)
    expect(r.status).toBe('VERDE')
  })
})

describe('fechamento mensal', () => {
  it('lançador não pode enviar para aprovação (autorização no servidor)', async () => {
    await expect(transicionar(lancadorMi, 'MANUT_INTERNA', '2026-09-01', 'ENVIAR_VALIDACAO', { versaoEsperada: 0 })).rejects.toThrow(/Acesso negado/)
  })
  it('indicador vermelho sem plano de ação bloqueia o envio', async () => {
    await expect(transicionar(admin, 'MANUT_EXTERNA', '2026-07-01', 'ENVIAR_VALIDACAO', { versaoEsperada: 0 })).rejects.toThrow(/sem plano de ação/)
  })
  it('com plano e explicação do desvio, envia; diretoria aprova; dados ficam bloqueados; reabertura exige justificativa', async () => {
    await tx({ usuarioId: admin.id }, async (db) => {
      await db.query(`insert into plano_acao (area_codigo, indicador_codigo, competencia_origem, causa_raiz, acao, entregavel, responsavel_nome, inicio, prazo, resultado_esperado)
        values ('MANUT_EXTERNA','ME_DESNECESSARIOS','2026-07-01','Clientes abrem chamado sem checagem básica','Implantar roteiro de triagem telefônica antes de abrir chamado','Roteiro publicado e equipe treinada','Gestor Manutenção','2026-08-01','2026-09-30','≤ 5%')`)
      await db.query(`insert into analise_item (competencia, area_codigo, tipo, fato, indicador_codigo, responsavel) values ('2026-07-01','MANUT_EXTERNA','EXPLICACAO_DESVIO','17 de 29 chamados sem defeito de equipamento','ME_DESNECESSARIOS','Gestor Manutenção')`)
    })
    await transicionar(admin, 'MANUT_EXTERNA', '2026-07-01', 'ENVIAR_VALIDACAO', { versaoEsperada: 0 })
    // concorrência: versão desatualizada é recusada
    await expect(transicionar(diretoria, 'MANUT_EXTERNA', '2026-07-01', 'APROVAR', { versaoEsperada: 0 })).rejects.toThrow(/alterado por outra pessoa/)
    await transicionar(diretoria, 'MANUT_EXTERNA', '2026-07-01', 'APROVAR', { versaoEsperada: 1 })
    await expect(tx({ usuarioId: admin.id }, (db) => db.query(`insert into analise_item (competencia, area_codigo, tipo, fato, numero, responsavel) values ('2026-07-01','MANUT_EXTERNA','DESTAQUE','Fato qualquer relevante','1','X')`)))
      .rejects.toThrow(/Reabra o período|reabra o período/i)
    await expect(transicionar(admin, 'MANUT_EXTERNA', '2026-07-01', 'REABRIR', { versaoEsperada: 2, justificativa: 'curta' })).rejects.toThrow(/justificativa/)
    await transicionar(admin, 'MANUT_EXTERNA', '2026-07-01', 'REABRIR', { versaoEsperada: 2, justificativa: 'Correção da classificação de 2 chamados solicitada pela Diretoria' })
    const ev = await q1<{ detalhes: { resultados_antes_da_reabertura: unknown[] } }>(`select detalhes from periodo_evento where acao = 'REABRIR' order by id desc limit 1`)
    expect(ev!.detalhes.resultados_antes_da_reabertura.length).toBeGreaterThan(0)
    const aud = await q1<{ n: number }>(`select count(*)::int n from auditoria where tabela = 'periodo_area'`)
    expect(aud!.n).toBeGreaterThanOrEqual(3)
  })
  it('selo oficial só com todas as áreas obrigatórias aprovadas', async () => {
    expect((await situacaoConsolidada('2026-07-01')).oficial).toBe(false)
    await q(`update configuracao set valor = '["MANUT_EXTERNA"]' where chave = 'fechamento.areas_obrigatorias'`)
    await q(`insert into periodo_area (competencia, area_codigo, status) values ('2026-05-01','MANUT_EXTERNA','FECHADO')`)
    expect((await situacaoConsolidada('2026-05-01')).oficial).toBe(true)
    await q(`update configuracao set valor = '["MANUT_INTERNA","MANUT_EXTERNA","ESTOQUE_PECAS","COMODATO","TI"]' where chave = 'fechamento.areas_obrigatorias'`)
  })
  it('checklist aponta pendências da área', async () => {
    const itens = await checklist('TI', '2026-09-01')
    expect(itens.some((i) => i.chave === 'TI_SEM_JANELA')).toBe(true)
  })
})
