import { NextResponse } from 'next/server'
import { encerrarSessao } from '@/lib/auth/sessao'
import { origemValida, negado } from '@/lib/http'

export async function POST(req: Request) {
  if (!origemValida(req)) return negado()
  await encerrarSessao()
  return NextResponse.redirect(new URL('/login', req.url), 303)
}
