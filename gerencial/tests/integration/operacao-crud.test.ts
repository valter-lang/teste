import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1 } from '@/lib/db'
import { entidade } from '@/lib/operacao/entidades'
import { atualizarRegistro, criarRegistro, excluirRegistro, importarLinhas, listarRegistros, MSG_CONFLITO, obterRegistro } from '@/lib/operacao/crud'
import { registrarTentativa } from '@/lib/operacao/comodato'

/**
 * Integração com o banco (DATABASE_URL). Usa competências em 2031 e números com prefixo
 * único; tudo o que é criado é removido no afterAll.
 */
const SUFIXO = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
const PREFIXO = `TST-OPS-${SUFIXO}`
let usuarioId = ''
let familiaPecaId = 0
let tecnicoInativoId = 0
const chamados: number[] = []

const chamadoDef = entidade('chamado_externo')
const movDef = entidade('movimento_estoque')

beforeAll(async () => {
  const u = await q1<{ id: string }>(`select id from usuario where lower(email) = 'admin@costalavos.local'`)
  if (!u) throw new Error('Usuário admin não encontrado (rode o seed).')
  usuarioId = u.id
  familiaPecaId = (await q1<{ id: number }>(`insert into familia_peca (nome) values ($1) returning id`, [`${PREFIXO} Motor`]))!.id
  tecnicoInativoId = (await q1<{ id: number }>(`insert into tecnico (nome, ativo) values ($1, false) returning id`, [`${PREFIXO} Técnico inativo`]))!.id
})

afterAll(async () => {
  const db = pool()
  await db.query(`delete from periodo_area where competencia between '2031-01-01' and '2031-12-01' and area_codigo in ('MANUT_EXTERNA','ESTOQUE_PECAS','COMODATO')`)
  await db.query(`delete from movimento_estoque where familia_id = $1`, [familiaPecaId])
  await db.query(`delete from solicitacao_troca where chamado_externo_id = any($1::int[])`, [chamados])
  await db.query(`update chamado_externo set chamado_anterior_id = null where numero like $1`, [`${PREFIXO}%`])
  await db.query(`delete from chamado_externo where numero like $1`, [`${PREFIXO}%`])
  await db.query(`delete from comodato_movimento where solicitacao_numero like $1`, [`${PREFIXO}%`])
  await db.query(`delete from familia_peca where id = $1`, [familiaPecaId])
  await db.query(`delete from tecnico where id = $1`, [tecnicoInativoId])
})

const ctx = () => ({ usuarioId })

describe('chamado externo com peças', () => {
  it('cria movimentos SAIDA vinculados (aplicação EXTERNA) e sincroniza na edição', async () => {
    const r = await criarRegistro(chamadoDef, {
      numero: `${PREFIXO}-1`, aberto_em: '2031-01-10T09:00', atendido_em: '2031-01-12T10:00',
      pecas: JSON.stringify([{ familia_id: String(familiaPecaId), quantidade: '2', valor_total: '10,50' }, { familia_id: String(familiaPecaId), quantidade: '1' }]),
    }, ctx())
    expect(r.ok, r.erro ?? JSON.stringify(r.erros)).toBe(true)
    chamados.push(r.id!)
    const movs = await q<{ id: number; tipo: string; aplicacao: string; data: string; competencia: string; quantidade: number; valor_total: number | null; criado_por: string }>(
      'select id, tipo, aplicacao, data, competencia, quantidade, valor_total, criado_por from movimento_estoque where chamado_externo_id = $1 and excluido_em is null order by id', [r.id])
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipo: 'SAIDA', aplicacao: 'EXTERNA', data: '2031-01-12', competencia: '2031-01-01', quantidade: 2, valor_total: 10.5, criado_por: usuarioId })

    // Remove uma linha e altera a outra: a removida é excluída logicamente
    const reg = await obterRegistro(chamadoDef, r.id!)
    const u = await atualizarRegistro(chamadoDef, r.id!, reg!.versao as number, {
      pecas: JSON.stringify([{ id: String(movs[0].id), familia_id: String(familiaPecaId), quantidade: '3', valor_total: '12' }]),
    }, ctx())
    expect(u.ok, u.erro).toBe(true)
    const ativos = await q<{ id: number; quantidade: number }>('select id, quantidade from movimento_estoque where chamado_externo_id = $1 and excluido_em is null', [r.id])
    expect(ativos).toEqual([{ id: movs[0].id, quantidade: 3 }])
    const removido = await q1<{ motivo_exclusao: string }>('select motivo_exclusao from movimento_estoque where id = $1', [movs[1].id])
    expect(removido?.motivo_exclusao).toMatch(/removida/)

    // Movimento gerado não pode ser editado pela tela de estoque
    const m = await atualizarRegistro(movDef, movs[0].id, null, { quantidade: '5' }, ctx())
    expect(m.ok).toBe(false)
    expect(m.erro).toMatch(/chamado de origem/)
  })

  it('pré-checa número duplicado e reincidência pelo número do chamado anterior', async () => {
    const dup = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-1`, aberto_em: '2031-01-15T09:00' }, ctx())
    expect(dup.ok).toBe(false)
    expect(dup.erros?.numero).toMatch(/Já existe/)
    const reinc = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-2`, aberto_em: '2031-01-20T09:00', reincidencia: 'true', chamado_anterior_numero: `${PREFIXO}-1` }, ctx())
    expect(reinc.ok, JSON.stringify(reinc.erros)).toBe(true)
    chamados.push(reinc.id!)
    const reg = await obterRegistro(chamadoDef, reinc.id!)
    expect(reg?.chamado_anterior_id).toBe(chamados[0])
    const inexistente = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-3`, aberto_em: '2031-01-20T09:00', chamado_anterior_numero: `${PREFIXO}-NAO` }, ctx())
    expect(inexistente.erros?.chamado_anterior_numero).toMatch(/não encontrado/)
  })

  it('recusa cadastro inativo em novo registro', async () => {
    const r = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-4`, aberto_em: '2031-01-20T09:00', tecnico_id: String(tecnicoInativoId) }, ctx())
    expect(r.ok).toBe(false)
    expect(r.erros?.tecnico_id).toMatch(/inativo/)
  })
})

describe('concorrência otimista', () => {
  it('segunda gravação com versão antiga é recusada', async () => {
    const r = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-5`, aberto_em: '2031-02-01T09:00' }, ctx())
    expect(r.ok).toBe(true)
    chamados.push(r.id!)
    const a = await atualizarRegistro(chamadoDef, r.id!, r.versao!, { solicitante: 'Primeira pessoa' }, ctx())
    expect(a.ok).toBe(true)
    expect(a.versao).toBe(r.versao! + 1)
    const b = await atualizarRegistro(chamadoDef, r.id!, r.versao!, { solicitante: 'Segunda pessoa' }, ctx())
    expect(b.ok).toBe(false)
    expect(b.erro).toBe(MSG_CONFLITO)
    const atual = await q1<{ solicitante: string; atualizado_por: string }>('select solicitante, atualizado_por from chamado_externo where id = $1', [r.id])
    expect(atual).toEqual({ solicitante: 'Primeira pessoa', atualizado_por: usuarioId })
  })
})

describe('bloqueio de período', () => {
  it('período APROVADO bloqueia inclusão e alteração', async () => {
    const r = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-6`, aberto_em: '2031-03-05T09:00' }, ctx())
    expect(r.ok).toBe(true)
    chamados.push(r.id!)
    await q(`insert into periodo_area (competencia, area_codigo, status) values ('2031-03-01', 'MANUT_EXTERNA', 'APROVADO')`)
    const novo = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-7`, aberto_em: '2031-03-06T09:00' }, ctx())
    expect(novo.ok).toBe(false)
    expect(novo.erro).toMatch(/APROVADO/)
    const alt = await atualizarRegistro(chamadoDef, r.id!, r.versao!, { solicitante: 'X' }, ctx())
    expect(alt.ok).toBe(false)
    expect(alt.erro).toMatch(/reabra o período/)
    await q(`delete from periodo_area where competencia = '2031-03-01' and area_codigo = 'MANUT_EXTERNA'`)
  })
})

describe('exclusão lógica', () => {
  it('exige motivo, oculta da lista e mantém para gestores', async () => {
    const r = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-8`, aberto_em: '2031-04-02T09:00' }, ctx())
    chamados.push(r.id!)
    const semMotivo = await excluirRegistro(chamadoDef, r.id!, r.versao!, '', ctx())
    expect(semMotivo.ok).toBe(false)
    const ex = await excluirRegistro(chamadoDef, r.id!, r.versao!, 'Lançado em duplicidade', ctx())
    expect(ex.ok, ex.erro).toBe(true)
    const visiveis = await listarRegistros(chamadoDef, { competencia: '2031-04-01', texto: PREFIXO })
    expect(visiveis.linhas.map((l) => l.id)).not.toContain(r.id)
    const todos = await listarRegistros(chamadoDef, { competencia: '2031-04-01', texto: PREFIXO, mostrarExcluidos: true })
    const linha = todos.linhas.find((l) => l.id === r.id)
    expect(linha?.motivo_exclusao).toBe('Lançado em duplicidade')
    expect(linha?.excluido_por).toBe(usuarioId)
    // Número volta a ficar livre (índice único parcial)
    const reuso = await criarRegistro(chamadoDef, { numero: `${PREFIXO}-8`, aberto_em: '2031-04-03T09:00' }, ctx())
    expect(reuso.ok).toBe(true)
    chamados.push(reuso.id!)
  })
})

describe('colar linhas', () => {
  it('grava as válidas numa transação e reporta as inválidas por linha', async () => {
    const r = await importarLinhas(movDef, [
      { linha: 2, entrada: { data: '05/05/2031', tipo: 'Entrada', familia_id: `${PREFIXO} motor`, quantidade: '10', valor_total: '1.000,00', documento_origem: 'NF 1' } },
      { linha: 3, entrada: { data: '06/05/2031', tipo: 'Ajuste', familia_id: `${PREFIXO} Motor`, quantidade: '-1' } },
      { linha: 4, entrada: { data: '07/05/2031', tipo: 'Saída', familia_id: 'Família que não existe', quantidade: '1' } },
      { linha: 5, entrada: { data: '31/02/2031', tipo: 'SAIDA', familia_id: `${PREFIXO} Motor`, quantidade: '1' } },
      { linha: 6, entrada: { data: '08/05/2031', tipo: 'SAIDA', familia_id: `#${familiaPecaId}`, quantidade: '4', competencia: '06/2031' } },
      { linha: 7, entrada: { data: '09/05/2031', tipo: 'SAIDA', familia_id: `${PREFIXO} Motor`, quantidade: '2,5' } },
    ], ctx())
    expect(r.erroGeral).toBeUndefined()
    expect(r.gravadas).toBe(2)
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4, 5, 6])
    expect(r.erros.find((e) => e.linha === 3)?.mensagem).toMatch(/Justificativa do ajuste/)
    expect(r.erros.find((e) => e.linha === 4)?.mensagem).toMatch(/não encontrad/)
    expect(r.erros.find((e) => e.linha === 6)?.mensagem).toMatch(/competência/i)
    const gravados = await q<{ quantidade: number; origem: string; competencia: string }>(
      'select quantidade, origem, competencia from movimento_estoque where id = any($1::int[]) order by id', [r.ids])
    expect(gravados).toEqual([
      { quantidade: 10, origem: 'MANUAL', competencia: '2031-05-01' },
      { quantidade: 2.5, origem: 'MANUAL', competencia: '2031-05-01' },
    ])
    const saldo = await q1<{ saldo_quantidade: number }>('select saldo_quantidade from saldo_estoque_peca where familia_id = $1 and item_peca_id is null and local_estoque_id is null', [familiaPecaId])
    expect(saldo?.saldo_quantidade).toBe(7.5 - 3 - 0) // 10 - 2,5 (colagem) - 3 (peça do chamado; a removida não conta)
  })

  it('período bloqueado recusa a linha sem perder as outras', async () => {
    await q(`insert into periodo_area (competencia, area_codigo, status) values ('2031-07-01', 'ESTOQUE_PECAS', 'FECHADO')`)
    const r = await importarLinhas(movDef, [
      { linha: 2, entrada: { data: '05/06/2031', tipo: 'ENTRADA', familia_id: `${PREFIXO} Motor`, quantidade: '1' } },
      { linha: 3, entrada: { data: '05/07/2031', tipo: 'ENTRADA', familia_id: `${PREFIXO} Motor`, quantidade: '1' } },
    ], ctx())
    expect(r.gravadas).toBe(1)
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0]).toMatchObject({ linha: 3 })
    expect(r.erros[0].mensagem).toMatch(/FECHADO/)
  })
})

describe('comodato: tentativas', () => {
  it('tentativa com sucesso conclui o movimento', async () => {
    const def = entidade('comodato_movimento')
    const m = await criarRegistro(def, { solicitacao_numero: `${PREFIXO}-C1`, tipo: 'ENTREGA', data_solicitacao: '2031-08-01', cliente_texto: 'Cliente teste' }, ctx())
    expect(m.ok, JSON.stringify(m.erros)).toBe(true)
    const falha = await registrarTentativa(m.id!, { data: '2031-08-02', sucesso: 'false', motivo_insucesso: 'Cliente ausente' }, usuarioId)
    expect(falha.ok).toBe(true)
    const antes = await registrarTentativa(m.id!, { data: '2031-07-30', sucesso: 'true' }, usuarioId)
    expect(antes.erros?.data).toBeTruthy()
    const ok = await registrarTentativa(m.id!, { data: '2031-08-03', sucesso: 'true' }, usuarioId)
    expect(ok.ok).toBe(true)
    const mov = await q1<{ situacao: string; data_conclusao: string; n: number }>(
      'select situacao, data_conclusao, (select count(*)::int from comodato_tentativa where movimento_id = $1) as n from comodato_movimento where id = $1', [m.id])
    expect(mov).toEqual({ situacao: 'CONCLUIDO', data_conclusao: '2031-08-03', n: 2 })
  })
})
