'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Alerta, Botao } from '@/components/ui'
import type { CalculoGrade, CampoCliente, Entrada, ResultadoLinha } from '@/lib/operacao/tipos'
import { CampoEntrada } from './CampoEntrada'

export interface LinhaGrade {
  id: number
  versao: number | null
  valores: Entrada
  somenteLeitura?: string | null
}

interface EstadoLinha {
  chaveUi: string
  id: number | null
  versao: number | null
  valores: Entrada
  original: Entrada
  somenteLeitura?: string | null
  msg?: { tom: 'ok' | 'erro'; texto: string }
  erros?: Record<string, string>
}

type AcaoLinha = (chave: string, id: number | null, versao: number | null, valores: Record<string, string>) => Promise<ResultadoLinha>

const numeroBr = (s: string | undefined) => {
  if (!s) return 0
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : NaN
}

/** Cálculos exibidos ao vivo na grade (a validação definitiva é do servidor). */
function calcular(tipo: CalculoGrade, v: Entrada): { texto: string; ok: boolean } {
  if (tipo === 'conciliacao_posicao') {
    const n = (k: string) => numeroBr(v[k])
    const dif = n('posicao_anterior') + n('entradas') - n('saidas_novos') - n('saidas_usados') + n('ajuste') - (n('novos') + n('usados'))
    if (Number.isNaN(dif)) return { texto: 'Valores inválidos', ok: false }
    return dif === 0 ? { texto: '✓ Concilia', ok: true } : { texto: `✗ Diferença ${dif > 0 ? '+' : '−'}${Math.abs(dif)}`, ok: false }
  }
  return { texto: '', ok: true }
}

let seqUi = 0
const novaChave = () => `n${++seqUi}`

/** Edição em grade: cada linha é salva individualmente (inclusão nas linhas novas). */
export function GradeEditavel({
  chave, campos, linhas, novas = [], padrao, acao, bloqueio, calculo, urlRegistro, legenda,
}: {
  chave: string
  campos: CampoCliente[]
  linhas: LinhaGrade[]
  novas?: Entrada[]
  padrao: Entrada
  acao: AcaoLinha
  bloqueio?: string | null
  calculo?: CalculoGrade
  urlRegistro: string
  legenda: string
}) {
  const [estado, setEstado] = useState<EstadoLinha[]>(() => [
    ...linhas.map((l) => ({ chaveUi: `r${l.id}`, id: l.id, versao: l.versao, valores: l.valores, original: l.valores, somenteLeitura: l.somenteLeitura })),
    ...novas.map((v) => ({ chaveUi: novaChave(), id: null, versao: null, valores: { ...padrao, ...v }, original: {} })),
    { chaveUi: novaChave(), id: null, versao: null, valores: { ...padrao }, original: {} },
  ])
  const [pendente, iniciar] = useTransition()
  const [salvando, setSalvando] = useState<string | null>(null)
  const desabilitada = !!bloqueio

  const alterada = (l: EstadoLinha) => campos.some((c) => (l.valores[c.nome] ?? '') !== (l.original[c.nome] ?? ''))
  const atualizar = (k: string, fn: (l: EstadoLinha) => EstadoLinha) => setEstado((ls) => ls.map((l) => (l.chaveUi === k ? fn(l) : l)))

  function salvar(l: EstadoLinha) {
    setSalvando(l.chaveUi)
    iniciar(async () => {
      const valores = Object.fromEntries(campos.map((c) => [c.nome, l.valores[c.nome] ?? '']))
      if (l.id === null && l.valores.competencia) valores.competencia = l.valores.competencia
      const r = await acao(chave, l.id, l.versao, valores)
      setSalvando(null)
      setEstado((ls) => {
        const out = ls.map((x) => {
          if (x.chaveUi !== l.chaveUi) return x
          if (!r.ok) return { ...x, msg: { tom: 'erro' as const, texto: r.erro ?? 'Não foi possível salvar.' }, erros: r.erros }
          const v = r.valores ?? x.valores
          return { ...x, id: r.id ?? x.id, versao: r.versao ?? null, valores: v, original: v, erros: undefined, msg: { tom: 'ok' as const, texto: x.id ? 'Alterações salvas.' : 'Registro incluído.' } }
        })
        // Sempre mantém uma linha em branco ao final para novas inclusões
        const ultima = out[out.length - 1]
        if (ultima.id !== null) out.push({ chaveUi: novaChave(), id: null, versao: null, valores: { ...padrao }, original: {} })
        return out
      })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {bloqueio && <Alerta tom="atencao" titulo="Edição indisponível">{bloqueio}</Alerta>}
      <p className="text-xs text-neutro">Altere as células e use “Salvar” em cada linha. A última linha em branco inclui um novo registro. Use Tab para navegar.</p>
      <div className="overflow-x-auto rounded-md border border-pedra/70">
        <table className="w-full border-collapse text-sm tabular">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-vinho px-2 py-2 text-left text-xs font-bold text-branco uppercase">Linha</th>
              {campos.map((c) => (
                <th key={c.nome} scope="col" className="bg-vinho px-2 py-2 text-left text-xs font-bold whitespace-nowrap text-branco uppercase">
                  {c.rotulo}{c.obrigatorio && <span aria-hidden> *</span>}
                </th>
              ))}
              {calculo && <th scope="col" className="bg-vinho px-2 py-2 text-left text-xs font-bold text-branco uppercase">Conciliação</th>}
              <th scope="col" className="bg-vinho px-2 py-2 text-left text-xs font-bold text-branco uppercase">Ação</th>
            </tr>
          </thead>
          <tbody>
            {estado.map((l, i) => {
              const ro = desabilitada || !!l.somenteLeitura
              const calc = calculo ? calcular(calculo, l.valores) : null
              const sujo = alterada(l)
              const errosFora = Object.entries(l.erros ?? {}).filter(([k]) => !campos.some((c) => c.nome === k))
              return (
                <tr key={l.chaveUi} className={clsx(l.id === null && 'bg-creme/60', l.msg?.tom === 'erro' && 'bg-critico-fundo/40')}>
                  <td className="sticky left-0 border-t border-pedra/50 bg-branco px-2 py-1 align-top text-xs whitespace-nowrap">
                    {l.id ? <Link className="font-semibold text-vinho underline" href={`${urlRegistro}/${l.id}`}>#{l.id}</Link> : <span className="text-neutro">Nova</span>}
                  </td>
                  {campos.map((c) => (
                    <td key={c.nome} className="border-t border-pedra/50 px-1 py-1 align-top">
                      <CampoEntrada compacto campo={c} id={`${c.nome}-${l.chaveUi}`} valor={l.valores[c.nome] ?? ''} desabilitado={ro}
                        rotuloAcessivel={`${c.rotulo}, linha ${i + 1}`} invalido={!!l.erros?.[c.nome]}
                        descritoPor={l.erros?.[c.nome] ? `msg-${l.chaveUi}` : undefined}
                        onChange={(v) => atualizar(l.chaveUi, (x) => ({ ...x, valores: { ...x.valores, [c.nome]: v }, msg: undefined }))} />
                      {l.erros?.[c.nome] && <p className="mt-0.5 max-w-48 text-[11px] font-semibold text-critico">{l.erros[c.nome]}</p>}
                    </td>
                  ))}
                  {calc && (
                    <td className={clsx('border-t border-pedra/50 px-2 py-1 align-top text-xs font-bold whitespace-nowrap', calc.ok ? 'text-ok' : 'text-critico')}>
                      {calc.texto}
                    </td>
                  )}
                  <td className="border-t border-pedra/50 px-2 py-1 align-top">
                    {l.somenteLeitura ? (
                      <span className="text-xs text-neutro">{l.somenteLeitura}</span>
                    ) : (
                      <Botao type="button" variante={sujo ? 'primario' : 'secundario'} className="px-2 py-1 text-xs"
                        disabled={ro || !sujo || (pendente && salvando === l.chaveUi)} onClick={() => salvar(l)}>
                        {pendente && salvando === l.chaveUi ? 'Salvando…' : l.id ? 'Salvar' : 'Incluir'}
                      </Botao>
                    )}
                    {l.msg && (
                      <p id={`msg-${l.chaveUi}`} role={l.msg.tom === 'erro' ? 'alert' : 'status'}
                        className={clsx('mt-1 max-w-64 text-[11px] font-semibold', l.msg.tom === 'erro' ? 'text-critico' : 'text-ok')}>
                        {l.msg.tom === 'erro' ? '✗ ' : '✓ '}{l.msg.texto}
                        {errosFora.length > 0 && ` ${errosFora.map(([, m]) => m).join(' ')}`}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
