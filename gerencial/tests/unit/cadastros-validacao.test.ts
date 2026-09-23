import { describe, expect, it } from 'vitest'
import { entidadePorSlug, ENTIDADES } from '@/lib/cadastros/definicoes'
import { formParaObjeto, numeroDecimal, validarEntrada } from '@/lib/cadastros/validacao'
import { mensagemAmigavel, ErroNegocio } from '@/lib/cadastros/erros'

const def = (s: string) => entidadePorSlug(s)!

describe('definições de cadastros', () => {
  it('cobre todos os cadastros exigidos, com slugs únicos', () => {
    const tabelas = ENTIDADES.map((e) => e.tabela)
    for (const t of ['unidade', 'rede', 'cliente', 'contrato_comodato', 'familia_equipamento', 'modelo_equipamento', 'equipamento',
      'tecnico', 'familia_peca', 'item_peca', 'local_estoque', 'ti_sistema']) expect(tabelas).toContain(t)
    expect(new Set(ENTIDADES.map((e) => e.slug)).size).toBe(ENTIDADES.length)
  })
  it('usa apenas identificadores seguros', () => {
    for (const e of ENTIDADES) {
      expect(e.tabela).toMatch(/^[a-z_]+$/)
      for (const c of e.campos) expect(c.nome).toMatch(/^[a-z_]+$/)
      for (const b of e.busca) expect(b).toMatch(/^[a-z_]+$/)
    }
  })
})

describe('validarEntrada', () => {
  it('exige campos obrigatórios e converte vazios em nulo', () => {
    const r = validarEntrada(def('clientes'), { fantasia: '  ', codigo_externo: '', uf: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros.fantasia).toMatch(/Informe/)
    const ok = validarEntrada(def('clientes'), { fantasia: ' Padaria X ', codigo_externo: 'c001', uf: 'sp', rede_id: '' })
    expect(ok).toEqual({ ok: true, dados: expect.objectContaining({ fantasia: 'Padaria X', codigo_externo: 'C001', uf: 'SP', rede_id: null, cidade: null }) })
  })
  it('rejeita UF e opção inválidas', () => {
    const r = validarEntrada(def('clientes'), { fantasia: 'A', uf: 'XX' })
    expect(r.ok).toBe(false)
    const t = validarEntrada(def('tecnicos'), { nome: 'Fulano', tipo: 'CHEFE' })
    expect(t.ok).toBe(false)
  })
  it('interpreta decimais pt-BR e valida mínimo', () => {
    expect(numeroDecimal('1.234,5')).toBe('1234.5')
    expect(numeroDecimal('0,125')).toBe('0.125')
    expect(numeroDecimal('12.5')).toBe('12.5')
    const r = validarEntrada(def('contratos'), { cliente_id: '3', consumo_minimo_kg_mes: '1.500,250' })
    expect(r.ok && r.dados.consumo_minimo_kg_mes).toBe(1500.25)
    const neg = validarEntrada(def('contratos'), { cliente_id: '3', consumo_minimo_kg_mes: '-1' })
    expect(neg.ok).toBe(false)
  })
  it('valida datas do contrato (fim >= início)', () => {
    const r = validarEntrada(def('contratos'), { cliente_id: '1', inicio: '2026-05-01', fim: '2026-04-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros.fim).toBeDefined()
  })
  it('equipamento: exige patrimônio ou série e cliente quando em cliente', () => {
    const semId = validarEntrada(def('equipamentos'), { familia_id: '1', situacao: 'ESTOQUE' })
    expect(semId.ok).toBe(false)
    const semCliente = validarEntrada(def('equipamentos'), { familia_id: '1', situacao: 'EM_CLIENTE', patrimonio: 'p1' })
    expect(semCliente.ok).toBe(false)
    if (!semCliente.ok) expect(semCliente.erros.cliente_id).toBeDefined()
    const ok = validarEntrada(def('equipamentos'), { familia_id: '1', situacao: 'EM_CLIENTE', patrimonio: 'p1', cliente_id: '9', linha: 'STAR' })
    expect(ok.ok && ok.dados.patrimonio).toBe('P1')
  })
  it('converte checkbox do FormData', () => {
    const fd = new FormData()
    fd.set('nome', 'ERP')
    fd.set('critico', 'on')
    expect(formParaObjeto(def('sistemas-ti'), fd)).toEqual({ nome: 'ERP', critico: true })
    fd.delete('critico')
    expect(formParaObjeto(def('sistemas-ti'), fd).critico).toBe(false)
  })
})

describe('mensagens amigáveis', () => {
  it('traduz conflito de unicidade pelo nome do índice', () => {
    const e = { code: '23505', constraint: 'rede_nome_uk' }
    expect(mensagemAmigavel(e, def('redes').unicos)).toBe('Já existe uma rede com este nome.')
    expect(mensagemAmigavel({ code: '23505', constraint: 'x' })).toMatch(/Já existe/)
    expect(mensagemAmigavel(new ErroNegocio('Regra X'))).toBe('Regra X')
    expect(mensagemAmigavel(new Error('detalhe interno'))).not.toMatch(/detalhe interno/)
  })
})
