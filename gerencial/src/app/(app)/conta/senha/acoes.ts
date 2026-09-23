'use server'
import { redirect } from 'next/navigation'
import { exigirLogin } from '@/lib/auth/sessao'
import { q1, tx } from '@/lib/db'
import { conferirSenha, hashSenha, validarPoliticaSenha } from '@/lib/auth/senha'

export async function alterarSenha(_: { erro?: string } | undefined, fd: FormData) {
  const u = await exigirLogin()
  const atual = String(fd.get('atual') ?? '')
  const nova = String(fd.get('nova') ?? '')
  const conf = String(fd.get('confirmacao') ?? '')
  const r = await q1<{ senha_hash: string }>('select senha_hash from usuario where id = $1', [u.id])
  if (!r || !(await conferirSenha(atual, r.senha_hash))) return { erro: 'Senha atual incorreta.' }
  if (nova !== conf) return { erro: 'A confirmação não confere.' }
  if (nova === atual) return { erro: 'A nova senha deve ser diferente da atual.' }
  const pol = validarPoliticaSenha(nova)
  if (pol) return { erro: pol }
  const h = await hashSenha(nova)
  await tx({ usuarioId: u.id }, (db) => db.query('update usuario set senha_hash = $2, deve_trocar_senha = false, atualizado_em = now() where id = $1', [u.id, h]))
  redirect('/')
}
