import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { q1 } from '@/lib/db'

/** Download de arquivos: logotipo (qualquer usuário autenticado), anexos e relatórios conforme permissão. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual()
  if (!u) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: 'Arquivo inválido' }, { status: 400 })
  const a = await q1<{ nome: string; mime: string; conteudo: Buffer; categoria: string; criado_por: string | null }>(
    'select nome, mime, conteudo, categoria, criado_por from arquivo where id = $1', [id])
  if (!a) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  if (a.categoria === 'RELATORIO') {
    const job = await q1<{ solicitado_por: string }>('select solicitado_por from relatorio_job where arquivo_id = $1', [id])
    if (!pode(u, 'relatorio.gerar') || (job && job.solicitado_por !== u.id && !pode(u, 'painel.ler'))) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
    }
  } else if (a.categoria === 'IMPORTACAO') {
    if (!pode(u, 'importacao.executar') && !pode(u, 'importacao.homologar')) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
  } else if (a.categoria === 'ANEXO') {
    if (!pode(u, 'dados.ler')) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
  }
  const inline = a.categoria === 'LOGOTIPO' || a.mime.startsWith('image/')
  return new NextResponse(new Uint8Array(a.conteudo), {
    headers: {
      'Content-Type': a.mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
