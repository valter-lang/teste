import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1 } from '@/lib/db'
import { entidadePorSlug } from '@/lib/cadastros/definicoes'
import { adicionarAlias, alterarAtivoCadastro, listarCadastro, obterCadastro, opcoesReferencia, removerAlias, salvarCadastro } from '@/lib/cadastros/servico'
import { salvarParametro } from '@/lib/cadastros/configuracao'

const def = (s: string) => entidadePorSlug(s)!
const TAG = `TESTECAD${Date.now().toString(36).toUpperCase()}`
let adminId: string
const criados: { tabela: string; id: number }[] = []

async function criar(slug: string, entrada: Record<string, unknown>) {
  const r = await salvarCadastro(def(slug), null, entrada, adminId)
  if (!r.ok) throw new Error(`falha ao criar ${slug}: ${JSON.stringify(r)}`)
  criados.push({ tabela: def(slug).tabela, id: r.id })
  return r.id
}

beforeAll(async () => {
  const a = await q1<{ id: string }>(`select u.id from usuario u join usuario_papel p on p.usuario_id = u.id where p.papel = 'ADMIN' and p.area_codigo is null order by u.criado_em limit 1`)
  adminId = a!.id
})

afterAll(async () => {
  // Remove na ordem inversa (dependências) o que o teste criou
  await q('delete from familia_equipamento_alias where alias like $1', [`${TAG}%`])
  for (const c of criados.reverse()) await q(`delete from ${c.tabela} where id = $1`, [c.id])
  await pool().end()
  delete (globalThis as { __clPool?: unknown }).__clPool
})

describe('cadastros: desativação preserva histórico', () => {
  it('desativa sem excluir, some das listas ativas, reativa', async () => {
    const redeId = await criar('redes', { nome: `${TAG} Rede` })
    const clienteId = await criar('clientes', { fantasia: `${TAG} Padaria`, rede_id: String(redeId), codigo_externo: `${TAG}01`, uf: 'SP' })

    const r = await alterarAtivoCadastro(def('clientes'), clienteId, false, adminId)
    expect(r.ok).toBe(true)
    const linha = await obterCadastro(def('clientes'), clienteId)
    expect(linha?.ativo).toBe(false)
    expect(linha?.valido_ate).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
    expect(linha?.rede_id).toBe(redeId) // vínculos preservados

    const ativos = await listarCadastro(def('clientes'), { busca: TAG, status: 'ativos' })
    expect(ativos.linhas.map((l) => l.id)).not.toContain(clienteId)
    const inativos = await listarCadastro(def('clientes'), { busca: TAG, status: 'inativos' })
    expect(inativos.linhas.map((l) => l.id)).toContain(clienteId)
    expect(inativos.linhas[0].rede_id__rotulo).toBe(`${TAG} Rede`)

    // auditoria registra o usuário responsável e o antes/depois
    const aud = await q1<{ usuario_id: string; antes: { ativo: boolean }; depois: { ativo: boolean } }>(
      `select usuario_id, antes, depois from auditoria where tabela = 'cliente' and registro_id = $1 and operacao = 'UPDATE' order by id desc limit 1`, [String(clienteId)])
    expect(aud?.usuario_id).toBe(adminId)
    expect(aud?.antes.ativo).toBe(true)
    expect(aud?.depois.ativo).toBe(false)

    expect((await alterarAtivoCadastro(def('clientes'), clienteId, true, adminId)).ok).toBe(true)
    const reativado = await obterCadastro(def('clientes'), clienteId)
    expect(reativado?.ativo).toBe(true)
    expect(reativado?.valido_ate).toBeNull()
  })

  it('cadastro desativado não pode ser usado em novos vínculos, mas o vínculo existente é mantido', async () => {
    const redeId = await criar('redes', { nome: `${TAG} Rede Inativa` })
    const clienteId = await criar('clientes', { fantasia: `${TAG} Mercado`, rede_id: String(redeId) })
    await alterarAtivoCadastro(def('redes'), redeId, false, adminId)

    const opcoes = await opcoesReferencia('rede')
    expect(opcoes.map((o) => o.id)).not.toContain(redeId)
    expect((await opcoesReferencia('rede', [redeId])).find((o) => o.id === redeId)?.ativo).toBe(false)

    const novo = await salvarCadastro(def('clientes'), null, { fantasia: `${TAG} Outro`, rede_id: String(redeId) }, adminId)
    expect(novo.ok).toBe(false)
    if (!novo.ok) expect(novo.erros?.rede_id).toMatch(/desativado/)

    // editar outro campo do cliente que já usa a rede desativada é permitido
    const edit = await salvarCadastro(def('clientes'), clienteId, { fantasia: `${TAG} Mercado Central`, rede_id: String(redeId) }, adminId)
    expect(edit.ok).toBe(true)
  })

  it('tecnico desativado recebe valido_ate; família sem a coluna só muda ativo', async () => {
    const tecId = await criar('tecnicos', { nome: `${TAG} Técnico`, tipo: 'TERCEIRO' })
    await alterarAtivoCadastro(def('tecnicos'), tecId, false, adminId)
    const t = await q1<{ ativo: boolean; valido_ate: string | null }>('select ativo, valido_ate from tecnico where id = $1', [tecId])
    expect(t).toEqual({ ativo: false, valido_ate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    const famId = await criar('familias-peca', { nome: `${TAG} Família`, classe_abc: 'A' })
    expect((await alterarAtivoCadastro(def('familias-peca'), famId, false, adminId)).ok).toBe(true)
    expect((await listarCadastro(def('familias-peca'), { busca: TAG })).linhas.map((l) => l.id)).not.toContain(famId)
  })
})

describe('cadastros: unicidade com mensagens amigáveis', () => {
  it('nome de rede (índice case-insensitive)', async () => {
    await criar('redes', { nome: `${TAG} Única` })
    const r = await salvarCadastro(def('redes'), null, { nome: `${TAG} única`.toLowerCase() }, adminId)
    expect(r).toEqual({ ok: false, erro: 'Já existe uma rede com este nome.' })
  })
  it('patrimônio (banco) e número de série (aplicação)', async () => {
    const fam = await q1<{ id: number }>('select id from familia_equipamento where ativo order by id limit 1')
    await criar('equipamentos', { familia_id: String(fam!.id), patrimonio: `${TAG}P1`, serial: `${TAG}S1`, situacao: 'ESTOQUE' })
    const p = await salvarCadastro(def('equipamentos'), null, { familia_id: String(fam!.id), patrimonio: `${TAG}P1`, situacao: 'ESTOQUE' }, adminId)
    expect(p).toEqual({ ok: false, erro: 'Já existe um equipamento com este patrimônio.' })
    const s = await salvarCadastro(def('equipamentos'), null, { familia_id: String(fam!.id), serial: `${TAG}s1`.toLowerCase(), situacao: 'ESTOQUE' }, adminId)
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.erros?.serial).toBe('Já existe um equipamento com este número de série.')
  })
  it('modelo precisa pertencer à família do equipamento', async () => {
    const fams = await q<{ id: number }>('select id from familia_equipamento where ativo order by id limit 2')
    const modeloId = await criar('modelos', { familia_id: String(fams[0].id), nome: `${TAG} Modelo` })
    const r = await salvarCadastro(def('equipamentos'), null,
      { familia_id: String(fams[1].id), modelo_id: String(modeloId), patrimonio: `${TAG}P9`, situacao: 'ESTOQUE' }, adminId)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros?.modelo_id).toMatch(/não pertence/)
  })
  it('sinônimos de família: duplicado recusado, remoção permitida', async () => {
    const fam = await q1<{ id: number }>('select id from familia_equipamento where ativo order by id limit 1')
    expect((await adicionarAlias(fam!.id, `${TAG} sinonimo`, adminId)).ok).toBe(true)
    expect(await adicionarAlias(fam!.id, `  ${TAG} SINONIMO `, adminId)).toEqual({ ok: false, erro: 'Este sinônimo já está associado a uma família de equipamento.' })
    expect((await removerAlias(fam!.id, `${TAG} SINONIMO`, adminId)).ok).toBe(true)
  })
})

describe('configuração: validação antes de gravar', () => {
  it('recusa valor inválido e grava valor válido com auditoria', async () => {
    const original = await q1<{ valor: unknown; homologado: boolean; atualizado_por: string | null }>(
      `select valor, homologado, atualizado_por from configuracao where chave = 'ranking.volume_minimo'`)
    try {
      expect(await salvarParametro('ranking.volume_minimo', { valor: '-3' }, false, adminId)).toEqual({ ok: false, erro: 'Mínimo de 1.' })
      expect(await salvarParametro('ranking.volume_minimo', { valor: 'abc' }, false, adminId)).toEqual({ ok: false, erro: 'Número inválido.' })
      expect((await salvarParametro('ranking.volume_minimo', { valor: '4' }, true, adminId)).ok).toBe(true)
      const r = await q1<{ valor: unknown; homologado: boolean }>(`select valor, homologado from configuracao where chave = 'ranking.volume_minimo'`)
      expect(r).toEqual({ valor: 4, homologado: true })
    } finally {
      await q(`update configuracao set valor = $1::jsonb, homologado = $2, atualizado_por = $3 where chave = 'ranking.volume_minimo'`,
        [JSON.stringify(original?.valor ?? 3), original?.homologado ?? false, original?.atualizado_por ?? null])
    }
  })
})
