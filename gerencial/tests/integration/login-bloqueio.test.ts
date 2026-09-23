import { afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { pool, q, q1 } from '@/lib/db'
import { autenticar } from '@/lib/auth/login'

const email = `bloqueio.${Date.now()}@teste.local`

afterAll(async () => {
  await q(`delete from usuario where email = $1`, [email])
  await pool().end()
})

describe('login', () => {
  it('bloqueia após 5 senhas erradas e não autentica nem com a senha certa durante o bloqueio', async () => {
    await q(`insert into usuario (nome, email, senha_hash, deve_trocar_senha) values ('Teste', $1, $2, false)`, [email, await bcrypt.hash('SenhaCerta123', 4)])
    for (let i = 0; i < 4; i++) expect((await autenticar(email, 'errada')).ok).toBe(false)
    expect((await q1<{ t: number }>(`select tentativas_falhas t from usuario where email = $1`, [email]))!.t).toBe(4)
    await autenticar(email, 'errada')
    const u = await q1<{ bloqueado: boolean }>(`select bloqueado_ate > now() as bloqueado from usuario where email = $1`, [email])
    expect(u!.bloqueado).toBe(true)
    const r = await autenticar(email, 'SenhaCerta123')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toMatch(/bloqueado/)
  })
  it('usuário inexistente recebe a mesma mensagem genérica', async () => {
    const r = await autenticar('ninguem@teste.local', 'x')
    expect(!r.ok && r.erro).toBe('E-mail ou senha inválidos.')
  })
})
