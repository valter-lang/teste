'use client'
import { useState } from 'react'
import { Botao, Entrada, Selecao } from '@/components/ui'
import type { LinhaPecaEntrada, Opcao } from '@/lib/operacao/tipos'

const VAZIA: LinhaPecaEntrada = { familia_id: '', item_peca_id: '', local_estoque_id: '', quantidade: '', valor_total: '' }

function lerInicial(json: string): LinhaPecaEntrada[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Linhas de peças (família, item opcional, local, quantidade, custo), serializadas em JSON no campo "pecas". */
export function EditorPecas({ inicial, opcoes, erro, desabilitado }: {
  inicial: string
  opcoes: { familias: Opcao[]; itens: Opcao[]; locais: Opcao[] }
  erro?: string
  desabilitado?: boolean
}) {
  const [linhas, setLinhas] = useState<LinhaPecaEntrada[]>(() => lerInicial(inicial))
  const alterar = (i: number, campo: keyof LinhaPecaEntrada, v: string) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)))

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="pecas" value={JSON.stringify(linhas)} />
      {erro && <p id="pecas-erro" role="alert" className="text-xs font-semibold text-critico">{erro}</p>}
      {linhas.length === 0 && <p className="text-sm text-neutro">Nenhuma peça informada.</p>}
      {linhas.map((l, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-pedra/60 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1.5fr_1fr_1fr_auto] lg:items-end">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Família da peça <span className="sr-only">(obrigatório)</span>
            <Selecao value={l.familia_id} onChange={(e) => alterar(i, 'familia_id', e.target.value)} aria-required>
              <option value="">Selecione</option>
              {opcoes.familias.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </Selecao>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Item (opcional)
            <Selecao value={l.item_peca_id} onChange={(e) => alterar(i, 'item_peca_id', e.target.value)}>
              <option value="">Não informado</option>
              {opcoes.itens.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </Selecao>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Local
            <Selecao value={l.local_estoque_id} onChange={(e) => alterar(i, 'local_estoque_id', e.target.value)}>
              <option value="">Não informado</option>
              {opcoes.locais.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </Selecao>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Quantidade <span className="sr-only">(obrigatório)</span>
            <Entrada inputMode="decimal" value={l.quantidade} onChange={(e) => alterar(i, 'quantidade', e.target.value)} aria-required />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Custo (R$)
            <Entrada inputMode="decimal" value={l.valor_total} onChange={(e) => alterar(i, 'valor_total', e.target.value)} placeholder="0,00" />
          </label>
          <Botao type="button" variante="perigo" disabled={desabilitado} onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
            aria-label={`Remover peça ${i + 1}`}>
            Remover
          </Botao>
        </div>
      ))}
      <div>
        <Botao type="button" variante="secundario" disabled={desabilitado} onClick={() => setLinhas((ls) => [...ls, { ...VAZIA }])}>
          Adicionar peça
        </Botao>
      </div>
    </div>
  )
}
