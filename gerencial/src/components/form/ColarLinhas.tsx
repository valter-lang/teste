'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Alerta, AreaTexto, Botao, Selecao } from '@/components/ui'
import type { CampoCliente, ResultadoColagem } from '@/lib/operacao/tipos'

type AcaoColar = (chave: string, competenciaPadrao: string, colunas: string[], linhas: string[][], primeiraLinha?: number) => Promise<ResultadoColagem>

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** TSV copiado do Excel: tabulação entre células; células com quebra de linha vêm entre aspas. */
export function lerTsv(texto: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let cel = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { cel += '"'; i++ }
      else if (ch === '"') aspas = false
      else cel += ch
    } else if (ch === '"' && cel === '') aspas = true
    else if (ch === '\t') { linha.push(cel); cel = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      linha.push(cel); linhas.push(linha); linha = []; cel = ''
    } else cel += ch
  }
  if (cel !== '' || linha.length) { linha.push(cel); linhas.push(linha) }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''))
}

function sugerirCampo(cabecalho: string, campos: CampoCliente[]): string {
  const h = norm(cabecalho)
  if (!h) return ''
  const exato = campos.find((c) => norm(c.rotulo) === h || norm(c.nome) === h)
  if (exato) return exato.nome
  const parcial = campos.find((c) => norm(c.rotulo).startsWith(h) || h.startsWith(norm(c.rotulo)))
  return parcial?.nome ?? ''
}

/** "Colar linhas" do Excel: mapeamento de cabeçalho, pré-visualização e gravação das linhas válidas. */
export function ColarLinhas({ chave, campos, competenciaPadrao, acao, bloqueio, urlRegistro }: {
  chave: string
  campos: CampoCliente[]
  competenciaPadrao: string
  acao: AcaoColar
  bloqueio?: string | null
  urlRegistro: string
}) {
  const [texto, setTexto] = useState('')
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [mapa, setMapa] = useState<Record<number, string>>({})
  const [resultado, setResultado] = useState<ResultadoColagem | null>(null)
  const [pendente, iniciar] = useTransition()

  const tabela = useMemo(() => lerTsv(texto), [texto])
  const cab = temCabecalho ? tabela[0] ?? [] : []
  const dados = temCabecalho ? tabela.slice(1) : tabela
  const nCol = Math.max(0, ...tabela.map((l) => l.length))
  const colunas = Array.from({ length: nCol }, (_, j) => mapa[j] ?? (temCabecalho ? sugerirCampo(cab[j] ?? '', campos) : ''))
  const obrigatoriosFaltando = campos.filter((c) => c.obrigatorio && c.nome !== 'competencia' && !colunas.includes(c.nome))
  const primeiraLinha = temCabecalho ? 2 : 1

  function gravar() {
    iniciar(async () => {
      setResultado(await acao(chave, competenciaPadrao, colunas, dados, primeiraLinha))
    })
  }

  function manterErros() {
    if (!resultado) return
    const falhas = new Set(resultado.erros.map((e) => e.linha))
    const manter = dados.filter((_, i) => falhas.has(i + primeiraLinha))
    const esc = (c: string) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
    setTexto([...(temCabecalho ? [cab] : []), ...manter].map((l) => l.map(esc).join('\t')).join('\n'))
    setResultado(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {bloqueio && <Alerta tom="atencao" titulo="Inclusão indisponível">{bloqueio}</Alerta>}
      <details className="rounded-md border border-pedra/60 bg-creme/50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Como preparar as linhas</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>Copie as células no Excel (inclusive a linha de cabeçalho) e cole abaixo. As colunas são associadas pelo nome; ajuste se necessário.</li>
          <li>Datas: dd/mm/aaaa (data e hora: dd/mm/aaaa hh:mm, horário de Brasília). Números: 1.234,56. Sim/Não para campos de marcação.</li>
          <li>Cadastros (cliente, técnico, família etc.) pelo nome ou código exatamente como cadastrados; use #id para informar o identificador.</li>
          <li>Sem coluna de competência, ela é derivada da data do evento ou assume {competenciaPadrao.slice(5, 7)}/{competenciaPadrao.slice(0, 4)}.</li>
          <li>Linhas válidas são gravadas; as inválidas são listadas com o número da linha para correção.</li>
          <li>Campos: {campos.map((c) => `${c.rotulo}${c.obrigatorio ? '*' : ''}`).join(', ')}.</li>
        </ul>
      </details>
      <label htmlFor={`colar-${chave}`} className="text-sm font-semibold">Linhas copiadas do Excel</label>
      <AreaTexto id={`colar-${chave}`} value={texto} onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
        rows={8} className="font-mono text-xs" disabled={!!bloqueio} spellCheck={false} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={temCabecalho} onChange={(e) => setTemCabecalho(e.target.checked)} />
        A primeira linha é o cabeçalho
      </label>

      {nCol > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">Mapeamento das colunas e pré-visualização ({dados.length} linha(s))</h3>
          <div className="overflow-x-auto rounded-md border border-pedra/70">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Mapeamento das colunas coladas para os campos</caption>
              <thead>
                <tr>
                  <th scope="col" className="bg-vinho px-2 py-1 text-left text-branco">Linha</th>
                  {colunas.map((c, j) => (
                    <th key={j} scope="col" className="bg-vinho px-1 py-1 text-left font-normal text-branco">
                      <span className="block truncate font-bold">{temCabecalho ? cab[j] || `Coluna ${j + 1}` : `Coluna ${j + 1}`}</span>
                      <Selecao value={c} onChange={(e) => setMapa((m) => ({ ...m, [j]: e.target.value }))} className="mt-1 min-w-36 px-1 py-0.5 text-xs"
                        aria-label={`Campo da coluna ${temCabecalho ? cab[j] || j + 1 : j + 1}`}>
                        <option value="">Ignorar coluna</option>
                        {campos.map((f) => <option key={f.nome} value={f.nome}>{f.rotulo}</option>)}
                      </Selecao>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.slice(0, 8).map((l, i) => (
                  <tr key={i}>
                    <td className="border-t border-pedra/50 px-2 py-1 text-neutro">{i + primeiraLinha}</td>
                    {colunas.map((c, j) => (
                      <td key={j} className={`border-t border-pedra/50 px-2 py-1 ${c ? '' : 'text-neutro line-through'}`}>{l[j] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dados.length > 8 && <p className="text-xs text-neutro">Mostrando 8 de {dados.length} linhas.</p>}
          {obrigatoriosFaltando.length > 0 && (
            <Alerta tom="atencao">Campos obrigatórios sem coluna associada: {obrigatoriosFaltando.map((c) => c.rotulo).join(', ')}. As linhas serão rejeitadas se o valor não tiver padrão.</Alerta>
          )}
          <div>
            <Botao type="button" onClick={gravar} disabled={pendente || !!bloqueio || !dados.length}>
              {pendente ? 'Validando e gravando…' : `Validar e gravar ${dados.length} linha(s)`}
            </Botao>
          </div>
        </div>
      )}

      {resultado && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {resultado.erroGeral && <Alerta tom="critico">{resultado.erroGeral}</Alerta>}
          <Alerta tom={resultado.gravadas ? 'ok' : 'info'}>
            {resultado.gravadas} linha(s) gravada(s){resultado.erros.length ? `; ${resultado.erros.length} com erro (não gravadas).` : '.'}
            {resultado.ids.length > 0 && resultado.ids.length <= 20 && (
              <span className="ml-1">
                Registros: {resultado.ids.map((id, k) => (
                  <span key={id}>{k > 0 && ', '}<Link className="underline" href={`${urlRegistro}/${id}`}>#{id}</Link></span>
                ))}
              </span>
            )}
          </Alerta>
          {resultado.erros.length > 0 && (
            <>
              <div role="alert" className="rounded-md border border-critico/40 bg-critico-fundo p-3 text-sm text-critico">
                <p className="font-bold">Linhas com erro</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {resultado.erros.map((e) => <li key={e.linha}><strong>Linha {e.linha}:</strong> {e.mensagem}</li>)}
                </ul>
              </div>
              <div><Botao type="button" variante="secundario" onClick={manterErros}>Manter apenas as linhas com erro para corrigir</Botao></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
