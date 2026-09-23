import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT, jwtVerify } from 'jose'
import { q } from '@/lib/db'
import type { Acao, Atribuicao, UsuarioSessao } from './permissoes'
import { exigir } from './permissoes'

const COOKIE = 'cl_sessao'
const DURACAO_H = 10

function segredo() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto (mínimo 32 caracteres).')
  return new TextEncoder().encode(s)
}

export async function criarSessao(usuarioId: string) {
  const token = await new SignJWT({ sub: usuarioId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_H}h`)
    .sign(segredo())
  const c = await cookies()
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_H * 3600,
  })
}

export async function encerrarSessao() {
  const c = await cookies()
  c.delete(COOKIE)
}

export async function usuarioIdDoToken(token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ['HS256'] })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export async function carregarUsuario(id: string): Promise<UsuarioSessao | null> {
  const rows = await q<{ id: string; nome: string; deve_trocar_senha: boolean; papel: string | null; area_codigo: string | null; unidade_id: number | null }>(
    `select u.id, u.nome, u.deve_trocar_senha, p.papel, p.area_codigo, p.unidade_id
       from usuario u left join usuario_papel p on p.usuario_id = u.id
      where u.id = $1 and u.ativo`,
    [id],
  )
  if (!rows.length) return null
  return {
    id: rows[0].id,
    nome: rows[0].nome,
    deveTrocarSenha: rows[0].deve_trocar_senha,
    atribuicoes: rows
      .filter((r) => r.papel)
      .map((r) => ({ papel: r.papel, area: r.area_codigo, unidadeId: r.unidade_id }) as Atribuicao),
  }
}

/** Usuário da requisição atual (ou null). */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const c = await cookies()
  const id = await usuarioIdDoToken(c.get(COOKIE)?.value)
  return id ? carregarUsuario(id) : null
}

/** Para páginas: redireciona ao login se não autenticado. */
export async function exigirLogin(): Promise<UsuarioSessao> {
  const u = await usuarioAtual()
  if (!u) redirect('/login')
  return u
}

/** Para páginas/ações: exige permissão (lança AcessoNegado). */
export async function exigirPermissao(acao: Acao, area?: string | null): Promise<UsuarioSessao> {
  const u = await usuarioAtual()
  if (!u) redirect('/login')
  exigir(u, acao, area)
  return u
}

export const NOME_COOKIE_SESSAO = COOKIE
