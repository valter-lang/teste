import 'server-only'
import { q1, q } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { conferirSenha } from './senha'

let hashFicticio: string | null = null
const ficticio = () => (hashFicticio ??= bcrypt.hashSync('senha-ficticia-tempo-constante', 12))

const MAX_TENTATIVAS = 5
const BLOQUEIO_MIN = 15

export type ResultadoLogin = { ok: true; usuarioId: string } | { ok: false; erro: string }

export async function autenticar(email: string, senha: string): Promise<ResultadoLogin> {
  const erroGenerico = { ok: false as const, erro: 'E-mail ou senha inválidos.' }
  const u = await q1<{ id: string; senha_hash: string; ativo: boolean; tentativas_falhas: number; bloqueado_ate: string | null }>(
    `select id, senha_hash, ativo, tentativas_falhas, bloqueado_ate from usuario where lower(email) = lower($1)`,
    [email.trim()],
  )
  if (!u || !u.ativo) {
    await conferirSenha(senha, ficticio()) // tempo constante
    return erroGenerico
  }
  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    return { ok: false, erro: `Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em ${BLOQUEIO_MIN} minutos.` }
  }
  const ok = await conferirSenha(senha, u.senha_hash)
  if (!ok) {
    const n = u.tentativas_falhas + 1
    const bloquear = n >= MAX_TENTATIVAS
    await q(`update usuario set tentativas_falhas = $2::int,
               bloqueado_ate = case when $3::boolean then now() + make_interval(mins => $4::int) end where id = $1`,
      [u.id, bloquear ? 0 : n, bloquear, BLOQUEIO_MIN])
    return erroGenerico
  }
  await q(`update usuario set tentativas_falhas = 0, bloqueado_ate = null, ultimo_login_em = now() where id = $1`, [u.id])
  await q(`insert into evento_sistema (tipo, usuario_id, detalhes) values ('LOGIN', $1, '{}'::jsonb)`, [u.id])
  return { ok: true, usuarioId: u.id }
}
