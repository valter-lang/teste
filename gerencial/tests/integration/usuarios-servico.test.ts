import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1 } from '@/lib/db'
import { conferirSenha, validarPoliticaSenha } from '@/lib/auth/senha'
import {
  adicionarAtribuicao, atualizarUsuario, criarUsuario, definirAtivoUsuario, desbloquearUsuario, obterUsuario, redefinirSenha, removerAtribuicao,
} from '@/lib/usuarios/servico'

const TAG = `teste-usr-${Date.now().toString(36)}`
let adminId: string
const criados: string[] = []

async function novo(nome: string) {
  const r = await criarUsuario({ nome, email: `${TAG}-${criados.length}@exemplo.local` }, adminId)
  if (!r.ok) throw new Error(r.erro)
  criados.push(r.id)
  return r
}

beforeAll(async () => {
  const a = await q1<{ id: string }>(`select u.id from usuario u join usuario_papel p on p.usuario_id = u.id where p.papel = 'ADMIN' and p.area_codigo is null and u.ativo order by u.criado_em limit 1`)
  adminId = a!.id
})

afterAll(async () => {
  if (criados.length) await q('delete from usuario where id = any($1::uuid[])', [criados])
  await pool().end()
  delete (globalThis as { __clPool?: unknown }).__clPool
})

describe('criação de usuário com senha temporária', () => {
  it('gera senha exibível uma vez, guarda só o hash e força a troca', async () => {
    const r = await novo('Usuária Teste')
    expect(validarPoliticaSenha(r.senhaTemporaria)).toBeNull()
    const u = await q1<{ senha_hash: string; deve_trocar_senha: boolean; email: string }>('select senha_hash, deve_trocar_senha, email from usuario where id = $1', [r.id])
    expect(u?.deve_trocar_senha).toBe(true)
    expect(u?.senha_hash).not.toContain(r.senhaTemporaria)
    expect(await conferirSenha(r.senhaTemporaria, u!.senha_hash)).toBe(true)
    expect(u?.email).toBe(`${TAG}-0@exemplo.local`)
    // obterUsuario nunca devolve o hash
    expect(Object.keys((await obterUsuario(r.id))!)).not.toContain('senha_hash')
    // evento registrado sem e-mail
    const ev = await q1<{ detalhes: Record<string, unknown> }>(`select detalhes from evento_sistema where tipo = 'USUARIO_CRIADO' and detalhes->>'usuario_alvo' = $1`, [r.id])
    expect(JSON.stringify(ev?.detalhes)).not.toMatch(/@/)
    // auditoria não guarda e-mail nem hash
    const aud = await q1<{ depois: Record<string, unknown> }>(`select depois from auditoria where tabela = 'usuario' and registro_id = $1 and operacao = 'INSERT'`, [r.id])
    expect(aud?.depois).not.toHaveProperty('email')
    expect(aud?.depois).not.toHaveProperty('senha_hash')
  })

  it('e-mail duplicado (sem diferenciar maiúsculas) gera mensagem amigável', async () => {
    const r = await criarUsuario({ nome: 'Duplicado', email: `${TAG}-0@EXEMPLO.local` }, adminId)
    expect(r).toEqual({ ok: false, erro: 'Já existe um usuário com este e-mail.' })
  })

  it('redefinir senha gera nova temporária, força troca e desbloqueia', async () => {
    const { id, senhaTemporaria } = await novo('Usuário Bloqueado')
    await q(`update usuario set deve_trocar_senha = false, tentativas_falhas = 4, bloqueado_ate = now() + interval '10 minutes' where id = $1`, [id])
    expect((await desbloquearUsuario(id, adminId)).ok).toBe(true)
    expect(await q1('select tentativas_falhas, bloqueado_ate from usuario where id = $1', [id])).toEqual({ tentativas_falhas: 0, bloqueado_ate: null })
    const r = await redefinirSenha(id, adminId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.senhaTemporaria).not.toBe(senhaTemporaria)
    const u = await q1<{ senha_hash: string; deve_trocar_senha: boolean }>('select senha_hash, deve_trocar_senha from usuario where id = $1', [id])
    expect(u?.deve_trocar_senha).toBe(true)
    expect(await conferirSenha(r.senhaTemporaria, u!.senha_hash)).toBe(true)
    expect(await conferirSenha(senhaTemporaria, u!.senha_hash)).toBe(false)
    expect((await atualizarUsuario(id, { nome: 'Nome Novo', email: `${TAG}-x@exemplo.local` }, adminId)).ok).toBe(true)
  })
})

describe('atribuições de perfil', () => {
  it('impede atribuição duplicada e aceita escopos diferentes', async () => {
    const { id } = await novo('Gestor Teste')
    expect((await adicionarAtribuicao(id, { papel: 'GESTOR', area: 'TI', unidadeId: '' }, adminId)).ok).toBe(true)
    expect(await adicionarAtribuicao(id, { papel: 'GESTOR', area: 'TI', unidadeId: '*' }, adminId))
      .toEqual({ ok: false, erro: 'Este usuário já possui esta atribuição (mesmo perfil, área e unidade).' })
    expect((await adicionarAtribuicao(id, { papel: 'GESTOR', area: '*', unidadeId: '' }, adminId)).ok).toBe(true)
    const un = await q1<{ id: number }>('select id from unidade where ativo order by id limit 1')
    expect((await adicionarAtribuicao(id, { papel: 'GESTOR', area: 'TI', unidadeId: String(un!.id) }, adminId)).ok).toBe(true)
    expect((await adicionarAtribuicao(id, { papel: 'GESTOR', area: 'RH', unidadeId: '' }, adminId)).ok).toBe(false)
    expect((await obterUsuario(id))?.atribuicoes).toHaveLength(3)
  })
})

describe('último administrador ativo', () => {
  it('não permite desativar nem remover o papel do último ADMIN global', async () => {
    const { id } = await novo('Admin Temporário')
    expect((await adicionarAtribuicao(id, { papel: 'ADMIN', area: '*', unidadeId: '*' }, adminId)).ok).toBe(true)
    const papel = await q1<{ id: number }>(`select id from usuario_papel where usuario_id = $1 and papel = 'ADMIN'`, [id])
    // Isola o cenário: temporariamente, apenas o novo usuário é ADMIN ativo
    const outros = await q<{ id: string }>(
      `select distinct u.id from usuario u join usuario_papel p on p.usuario_id = u.id
        where u.ativo and p.papel = 'ADMIN' and p.area_codigo is null and u.id <> $1`, [id])
    await q('update usuario set ativo = false where id = any($1::uuid[])', [outros.map((o) => o.id)])
    try {
      const d = await definirAtivoUsuario(id, false, adminId)
      expect(d).toEqual({ ok: false, erro: 'Operação bloqueada: o sistema precisa manter pelo menos um administrador ativo.' })
      const rm = await removerAtribuicao(papel!.id, adminId)
      expect(rm.ok).toBe(false)
      expect((await q1<{ ativo: boolean }>('select ativo from usuario where id = $1', [id]))?.ativo).toBe(true)
      // ADMIN restrito a área não conta como administrador global
      expect((await adicionarAtribuicao(id, { papel: 'ADMIN', area: 'TI', unidadeId: '' }, adminId)).ok).toBe(true)
      expect((await removerAtribuicao(papel!.id, adminId)).ok).toBe(false)
    } finally {
      await q('update usuario set ativo = true where id = any($1::uuid[])', [outros.map((o) => o.id)])
    }
    // com outro ADMIN ativo, a desativação passa
    expect((await definirAtivoUsuario(id, false, adminId)).ok).toBe(true)
    expect((await definirAtivoUsuario(id, true, adminId)).ok).toBe(true)
    expect((await removerAtribuicao(papel!.id, adminId)).ok).toBe(true)
  })
})
