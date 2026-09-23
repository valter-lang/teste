import { NextResponse } from 'next/server'
import { usuarioAtual } from '@/lib/auth/sessao'
import { pode, temPapel } from '@/lib/auth/permissoes'
import { q } from '@/lib/db'
import { competenciaAtual, somarMeses, validarCompetencia } from '@/lib/competencia'
import { ehEntidade, entidade } from '@/lib/operacao/entidades'
import { listarRegistros } from '@/lib/operacao/crud'
import { listarSaldos, type FiltrosSaldo } from '@/lib/operacao/saldos'
import { linhaCsv, valorCsv } from '@/lib/operacao/exibicao'

/**
 * Exportação CSV (UTF-8 com BOM, separador ';', números/datas pt-BR) do filtro atual.
 * Somente leitura; nunca inclui e-mail, ramal ou IP (ficam em tabela restrita não exportada).
 */
const BOM = '﻿'
const texto = (sp: URLSearchParams, k: string) => {
  const v = sp.get(k)?.trim()
  return v ? v.slice(0, 200) : undefined
}

function resposta(nome: string, linhas: string[]) {
  return new NextResponse(BOM + linhas.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function registrar(usuarioId: string, detalhes: Record<string, unknown>) {
  await q(`insert into evento_sistema (tipo, usuario_id, detalhes) values ('EXPORTACAO_CSV', $1, $2)`, [usuarioId, JSON.stringify(detalhes)])
}

export async function GET(req: Request, ctx: { params: Promise<{ tipo: string }> }) {
  const u = await usuarioAtual()
  if (!u) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  const { tipo } = await ctx.params
  const sp = new URL(req.url).searchParams

  if (tipo === 'saldos_estoque') {
    if (!pode(u, 'dados.ler', 'ESTOQUE_PECAS')) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
    const sit = texto(sp, 'situacao')
    const f: FiltrosSaldo = {
      familiaId: Number(sp.get('familia')) || undefined,
      localId: Number(sp.get('local')) || undefined,
      texto: texto(sp, 'q'),
      situacao: sit === 'negativo' || sit === 'abaixo_minimo' || sit === 'critico' ? sit : '',
    }
    const linhas = await listarSaldos(f)
    const num = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
    const out = [linhaCsv(['Família', 'Item', 'Local', 'Saldo (qtd)', 'Unidade', 'Estoque mínimo', 'Crítico', 'Saldo (R$)', 'Última movimentação'])]
    for (const l of linhas) {
      out.push(linhaCsv([l.familia, l.item ?? '', l.local ?? '', num(l.saldo_quantidade), l.unidade_medida ?? '', num(l.estoque_minimo),
        l.critico == null ? '' : l.critico ? 'Sim' : 'Não', num(l.saldo_valor), l.ultima_movimentacao ? l.ultima_movimentacao.split('-').reverse().join('/') : '']))
    }
    await registrar(u.id, { entidade: tipo, filtros: { familia: f.familiaId ?? null, local: f.localId ?? null, situacao: f.situacao || null }, busca_texto: !!f.texto, registros: linhas.length })
    return resposta(`saldos-estoque-${new Date().toISOString().slice(0, 10)}.csv`, out)
  }

  if (!ehEntidade(tipo)) return NextResponse.json({ erro: 'Tipo de exportação inválido' }, { status: 404 })
  const def = entidade(tipo)
  if (!pode(u, 'dados.ler', def.area)) return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })

  const compParam = sp.get('competencia') ?? ''
  const competencia = def.semCompetencia ? null : validarCompetencia(compParam) ? compParam : somarMeses(competenciaAtual(), -1)
  const selecoes = Object.fromEntries(def.filtros.map((f) => [f, texto(sp, f)]))
  const mostrarExcluidos = temPapel(u, 'GESTOR', 'ADMIN') && sp.get('excluidos') === '1' && def.controle.exclusao !== 'fisica'
  const busca = texto(sp, 'q')
  const { linhas } = await listarRegistros(def, { competencia, texto: busca, selecoes, mostrarExcluidos, porPagina: null })

  const campos = def.campos.filter((c) => !c.oculto && !c.virtual)
  const vinculos = def.vinculos ?? []
  const calculadas = def.calculadas ?? []
  const out = [linhaCsv(['ID', ...campos.map((c) => c.rotulo), ...vinculos.map((v) => `${v.rotulo} vinculado (nº)`), ...calculadas.map((c) => c.rotulo),
    ...(mostrarExcluidos ? ['Excluído', 'Motivo da exclusão'] : [])])]
  for (const r of linhas) {
    out.push(linhaCsv([
      String(r.id),
      ...campos.map((c) => valorCsv(c, r[c.nome], r.__rotulos?.[c.nome])),
      ...vinculos.map((v) => r.__vinculos?.[v.campoNumero] ?? ''),
      ...calculadas.map((c) => valorCsv(c, r[c.nome])),
      ...(mostrarExcluidos ? [r.excluido_em ? 'Sim' : 'Não', r.excluido_em ? String(r.motivo_exclusao ?? '') : ''] : []),
    ]))
  }
  await registrar(u.id, {
    entidade: def.chave, competencia, filtros: Object.fromEntries(Object.entries(selecoes).filter(([, v]) => v)),
    busca_texto: !!busca, excluidos: mostrarExcluidos, registros: linhas.length,
  })
  return resposta(`${def.chave.replaceAll('_', '-')}${competencia ? `-${competencia.slice(0, 7)}` : ''}.csv`, out)
}
