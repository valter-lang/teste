import Link from 'next/link'
import clsx from 'clsx'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { data, moeda, numero } from '@/lib/format'
import { AbasArea } from '@/components/AbasArea'
import { Alerta, Botao, Cabecalho, Card, Entrada, Etiqueta, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { carregarOpcoes } from '@/lib/operacao/cadastros'
import { listarSaldos, type FiltrosSaldo } from '@/lib/operacao/saldos'

export const metadata = { title: 'Saldos de peças' }

const SITUACOES = [
  { valor: 'negativo', rotulo: 'Saldo negativo' },
  { valor: 'abaixo_minimo', rotulo: 'Abaixo do estoque mínimo' },
  { valor: 'critico', rotulo: 'Itens críticos' },
] as const

/** Saldos calculados (view saldo_estoque_peca) — somente leitura; o saldo nunca é digitado. */
export default async function Pagina({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirLogin()
  if (!pode(u, 'dados.ler', 'ESTOQUE_PECAS')) return <><Cabecalho titulo="Saldos de peças" /><Alerta tom="critico">Acesso negado para o seu perfil.</Alerta></>
  const sp = await searchParams
  const sit = paramTexto(sp.situacao)
  const f: FiltrosSaldo = {
    familiaId: paramInteiro(sp.familia, 0) || undefined,
    localId: paramInteiro(sp.local, 0) || undefined,
    texto: paramTexto(sp.q),
    situacao: SITUACOES.some((s) => s.valor === sit) ? (sit as FiltrosSaldo['situacao']) : '',
  }
  const [linhas, op] = await Promise.all([listarSaldos(f), carregarOpcoes(['familia_peca', 'local_estoque'])])
  const totalValor = linhas.reduce((s, l) => s + (l.saldo_valor ?? 0), 0)
  const q = new URLSearchParams(Object.entries({ familia: f.familiaId, local: f.localId, q: f.texto, situacao: f.situacao })
    .filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString()

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo="Saldos de peças" subtitulo="Calculados a partir das movimentações (entradas − saídas ± ajustes). Para corrigir um saldo, lance um ajuste justificado."
        acoes={<a href={`/api/exportar/saldos_estoque${q ? `?${q}` : ''}`} className="inline-flex items-center rounded-md border border-pedra bg-branco px-3.5 py-2 text-sm font-semibold text-tinta hover:bg-creme">Exportar CSV</a>} />
      <AbasArea area="ESTOQUE_PECAS" ativo="saldos" />
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-md border border-pedra/60 bg-branco p-3" role="search" aria-label="Filtros">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
          Buscar
          <Entrada name="q" type="search" defaultValue={f.texto ?? ''} placeholder="Família, item, código ou local" className="py-1.5" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Família
          <Selecao name="familia" defaultValue={f.familiaId ? String(f.familiaId) : ''} className="py-1.5">
            <option value="">Todas</option>
            {(op.familia_peca ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Local
          <Selecao name="local" defaultValue={f.localId ? String(f.localId) : ''} className="py-1.5">
            <option value="">Todos</option>
            {(op.local_estoque ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Situação
          <Selecao name="situacao" defaultValue={f.situacao ?? ''} className="py-1.5">
            <option value="">Todas</option>
            {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </Selecao>
        </label>
        <Botao type="submit" variante="secundario" className="py-1.5">Filtrar</Botao>
        <Link href="/estoque-pecas/saldos" className="py-1.5 text-sm font-semibold text-vinho underline">Limpar</Link>
      </form>
      <Card>
        {linhas.length === 0 ? <Vazio>Nenhum saldo com os filtros atuais.</Vazio> : (
          <Tabela legenda="Saldos de peças por família, item e local">
            <thead>
              <tr><Th>Família</Th><Th>Item</Th><Th>Local</Th><Th alinhar="direita">Saldo</Th><Th alinhar="direita">Mínimo</Th><Th>Situação</Th><Th alinhar="direita">Valor</Th><Th>Última mov.</Th></tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const negativo = l.saldo_quantidade < 0
                const abaixo = l.estoque_minimo != null && l.saldo_quantidade < l.estoque_minimo
                return (
                  <tr key={i}>
                    <Td>{l.familia}</Td>
                    <Td className={clsx(!l.item && 'text-neutro italic')}>{l.item ?? 'Sem item (família)'}{l.critico && <span className="ml-2"><Etiqueta tom="dourado">Crítico</Etiqueta></span>}</Td>
                    <Td className={clsx(!l.local && 'text-neutro italic')}>{l.local ?? 'Não informado'}</Td>
                    <Td alinhar="direita" className="font-semibold">{numero(l.saldo_quantidade, Number.isInteger(l.saldo_quantidade) ? 0 : 3)} {l.unidade_medida ?? ''}</Td>
                    <Td alinhar="direita">{numero(l.estoque_minimo)}</Td>
                    <Td>
                      {negativo ? <Etiqueta tom="critico">▲ Negativo</Etiqueta> : abaixo ? <Etiqueta tom="atencao">! Abaixo do mínimo</Etiqueta> : <Etiqueta tom="ok">✓ Regular</Etiqueta>}
                    </Td>
                    <Td alinhar="direita">{moeda(l.saldo_valor)}</Td>
                    <Td>{data(l.ultima_movimentacao)}</Td>
                  </tr>
                )
              })}
              <tr className="bg-creme font-bold">
                <Td colSpan={6}>Total ({linhas.length} posição(ões))</Td>
                <Td alinhar="direita">{moeda(totalValor)}</Td>
                <Td />
              </tr>
            </tbody>
          </Tabela>
        )}
      </Card>
    </div>
  )
}
