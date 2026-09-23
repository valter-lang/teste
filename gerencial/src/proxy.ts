import { NextResponse, type NextRequest } from 'next/server'

const PUBLICAS = ['/login', '/api/saude']

/** Verificação otimista: sem cookie de sessão -> login. A autorização real ocorre no servidor. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!publica && !req.cookies.get('cl_sessao')) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  const headers = new Headers(req.headers)
  headers.set('x-cl-path', pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
