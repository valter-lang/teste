import 'server-only'
import { NextResponse } from 'next/server'

/** Proteção CSRF para route handlers que alteram estado: exige Origin igual ao host. */
export function origemValida(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export const negado = (msg = 'Acesso negado') => NextResponse.json({ erro: msg }, { status: 403 })
