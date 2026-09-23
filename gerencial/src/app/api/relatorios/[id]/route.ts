import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { lerJob } from '@/lib/relatorios/fila'

/** Situação de um job da central de relatórios (consultada pela interface a cada 2 s). */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual()
  if (!u) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (!pode(u, 'relatorio.gerar')) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
  const { id } = await ctx.params
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ erro: 'Identificador inválido' }, { status: 400 })
  const j = await lerJob(n, u)
  if (!j) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({
    id: j.id, status: j.status, progresso: j.progresso, etapa: j.etapa, mensagem_erro: j.mensagem_erro, arquivo_id: j.arquivo_id,
    arquivo_nome: j.arquivo_nome, versao: j.versao, situacao_fechamento: j.situacao_fechamento,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
