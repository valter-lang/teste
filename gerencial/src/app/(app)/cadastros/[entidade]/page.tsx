import { notFound } from 'next/navigation'
import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { Alerta, BotaoLink, Cabecalho, Card, Entrada, Botao, Selecao, Tabela, Td, Th, Vazio, Paginacao } from '@/components/ui'
import { entidadePorSlug } from '@/lib/cadastros/definicoes'
import { listarCadastro, type FiltroStatus } from '@/lib/cadastros/servico'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { AcaoRapida } from '../_ui/AcaoRapida'
import { Celula, EtiquetaAtivo } from '../_ui/celula'
import { alternarAtivoAcao } from '../acoes'

const MENSAGENS_OK: Record<string, string> = {
  criado: 'Cadastro criado.',
  salvo: 'Alterações salvas.',
  desativado: 'Cadastro desativado. O histórico foi preservado; use o filtro "Somente desativados" para consultá-lo ou reativá-lo.',
  reativado: 'Cadastro reativado.',
}

export default async function ListaCadastro({ params, searchParams }: { params: Promise<{ entidade: string }>; searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler')
  const { entidade } = await params
  const def = entidadePorSlug(entidade)
  if (!def) notFound()
  const sp = await searchParams
  const busca = paramTexto(sp.busca)
  const statusParam = paramTexto(sp.status)
  const status: FiltroStatus = statusParam === 'inativos' || statusParam === 'todos' ? statusParam : 'ativos'
  const pagina = paramInteiro(sp.pagina, 1)
  const clienteId = def.slug === 'contratos' ? paramInteiro(sp.cliente_id, 0) : 0
  const { linhas, total, porPagina } = await listarCadastro(def, { busca, status, pagina, igual: clienteId ? { cliente_id: clienteId } : undefined })
  const editar = pode(u, 'cadastros.editar')
  const colunas = def.colunasLista.map((n) => def.campos.find((c) => c.nome === n)!).filter(Boolean)
  const ok = paramTexto(sp.ok)
  const href = (p: number) => {
    const q = new URLSearchParams()
    if (busca) q.set('busca', busca)
    if (status !== 'ativos') q.set('status', status)
    if (clienteId) q.set('cliente_id', String(clienteId))
    if (p > 1) q.set('pagina', String(p))
    const s = q.toString()
    return `/cadastros/${def.slug}${s ? '?' + s : ''}`
  }

  return (
    <div>
      <p className="mb-2 text-sm"><Link href="/cadastros" className="font-semibold text-vinho hover:underline">← Cadastros</Link></p>
      <Cabecalho titulo={def.titulo} subtitulo={def.descricao}
        acoes={editar && <BotaoLink variante="primario" href={`/cadastros/${def.slug}/novo${clienteId ? `?cliente_id=${clienteId}` : ''}`}>+ Novo {def.singular}</BotaoLink>} />
      {ok && <div className="mb-4"><Alerta tom="ok">✓ {MENSAGENS_OK[ok] ?? 'Alterações salvas.'}</Alerta></div>}
      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
          {clienteId > 0 && <input type="hidden" name="cliente_id" value={clienteId} />}
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <label htmlFor="busca" className="text-sm font-semibold">Pesquisar</label>
            <Entrada id="busca" name="busca" defaultValue={busca} placeholder="Digite parte do nome ou código" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-sm font-semibold">Situação</label>
            <Selecao id="status" name="status" defaultValue={status}>
              <option value="ativos">Somente ativos</option>
              <option value="inativos">Somente desativados</option>
              <option value="todos">Todos</option>
            </Selecao>
          </div>
          <Botao type="submit" variante="secundario">Filtrar</Botao>
        </form>
        {linhas.length === 0 ? (
          <Vazio>Nenhum registro encontrado{busca ? ` para “${busca}”` : ''}.</Vazio>
        ) : (
          <Tabela legenda={`Lista de ${def.titulo.toLowerCase()}`}>
            <thead>
              <tr>
                {colunas.map((c) => <Th key={c.nome}>{c.rotulo}</Th>)}
                <Th>Situação</Th>
                <Th alinhar="direita">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className={l.ativo ? '' : 'bg-creme/60 text-neutro'}>
                  {colunas.map((c) => <Td key={c.nome}><Celula campo={c} linha={l} /></Td>)}
                  <Td><EtiquetaAtivo ativo={l.ativo} validoAte={l.valido_ate} /></Td>
                  <Td alinhar="direita">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <BotaoLink href={`/cadastros/${def.slug}/${l.id}`} className="px-2.5 py-1 text-xs" aria-label={`${editar ? 'Editar' : 'Ver'} ${l._rotulo}`}>
                        {editar ? 'Editar' : 'Ver'}
                      </BotaoLink>
                      {editar && (
                        <AcaoRapida
                          acao={alternarAtivoAcao}
                          campos={{ entidade: def.slug, id: String(l.id), ativo: String(!l.ativo), _voltar: href(pagina) }}
                          rotulo={l.ativo ? 'Desativar' : 'Reativar'}
                          rotuloAcessivel={`${l.ativo ? 'Desativar' : 'Reativar'} ${l._rotulo}`}
                          variante={l.ativo ? 'perigo' : 'secundario'}
                          confirmar={l.ativo ? `Desativar “${l._rotulo}”? O histórico é preservado e o cadastro deixa de aparecer para novos lançamentos.` : undefined}
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <Paginacao pagina={pagina} total={total} porPagina={porPagina} hrefPara={href} />
      </Card>
    </div>
  )
}
