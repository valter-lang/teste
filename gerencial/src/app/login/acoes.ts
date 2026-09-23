'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { autenticar } from '@/lib/auth/login'
import { criarSessao } from '@/lib/auth/sessao'

const Esquema = z.object({ email: z.string().email('Informe um e-mail válido.'), senha: z.string().min(1, 'Informe a senha.') })

export async function entrar(_: { erro?: string } | undefined, fd: FormData) {
  const p = Esquema.safeParse({ email: fd.get('email'), senha: fd.get('senha') })
  if (!p.success) return { erro: p.error.issues[0].message }
  const r = await autenticar(p.data.email, p.data.senha)
  if (!r.ok) return { erro: r.erro }
  await criarSessao(r.usuarioId)
  redirect('/')
}
