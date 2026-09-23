'use client'
import { useActionState, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Alerta, Botao, Campo } from '@/components/ui'
import type { CampoCliente, EstadoForm, Entrada, Opcao, RegraUi } from '@/lib/operacao/tipos'
import { CampoEntrada } from './CampoEntrada'
import { EditorPecas } from './EditorPecas'

export interface OpcoesPecas {
  familias: Opcao[]
  itens: Opcao[]
  locais: Opcao[]
}

/** Formulário genérico de inclusão/edição (server action + useActionState). */
export function FormularioRegistro({
  campos, valores, acao, versao, bloqueio, pecas, regrasUi, rotuloEnviar = 'Salvar', mensagemInicial,
}: {
  campos: CampoCliente[]
  valores: Entrada
  acao: (prev: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>
  versao?: number | null
  bloqueio?: string | null
  pecas?: OpcoesPecas | null
  regrasUi?: RegraUi[]
  rotuloEnviar?: string
  mensagemInicial?: string
}) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  const [aviso, setAviso] = useState<string | null>(null)
  // Valores do servidor mais recentes que o último envio (ex.: outra ação alterou o registro) prevalecem
  const recente = estado && (estado.versao == null || versao == null || estado.versao >= versao)
  const atuais = { ...valores, ...(recente ? estado?.valores ?? {} : {}) }
  const versaoAtual = recente && estado?.versao != null ? estado.versao : versao
  const erros = estado?.erros ?? {}
  const desabilitado = !!bloqueio

  const grupos: { titulo: string | null; campos: CampoCliente[] }[] = []
  for (const c of campos) {
    const g = c.grupo ?? null
    let alvo = grupos.find((x) => x.titulo === g)
    if (!alvo) grupos.push((alvo = { titulo: g, campos: [] }))
    alvo.campos.push(c)
  }

  function aoAlterar(e: FormEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement
    for (const r of regrasUi ?? []) {
      if (t.name !== r.campo) continue
      if (t.value === r.valor) {
        const alvo = e.currentTarget.elements.namedItem(r.definir) as HTMLSelectElement | null
        if (alvo) alvo.value = r.para
        setAviso(r.aviso)
      } else setAviso(null)
    }
  }

  const errosGerais = Object.entries(erros).filter(([k]) => !campos.some((c) => c.nome === k) && k !== 'pecas')
  return (
    <form key={`${estado?.seq ?? 0}-${versao ?? ""}`} action={enviar} onChange={aoAlterar} className="flex flex-col gap-5" noValidate autoComplete="off">
      {bloqueio && <Alerta tom="atencao" titulo="Edição indisponível">{bloqueio}</Alerta>}
      {!estado && mensagemInicial && <Alerta tom="ok">{mensagemInicial}</Alerta>}
      {estado?.ok && <Alerta tom="ok">{estado.ok}</Alerta>}
      {estado?.erro && (
        <Alerta tom="critico" titulo={estado.erro}>
          {Object.keys(erros).length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(erros).map(([k, m]) => {
                const c = campos.find((x) => x.nome === k)
                return (
                  <li key={k}>
                    {c ? <a className="underline" href={`#${k}`}>{c.rotulo}</a> : k === 'pecas' ? 'Peças utilizadas' : 'Geral'}: {m}
                  </li>
                )
              })}
            </ul>
          )}
        </Alerta>
      )}
      {errosGerais.length > 0 && !estado?.erro && <Alerta tom="critico">{errosGerais.map(([, m]) => m).join(' ')}</Alerta>}
      {versaoAtual != null && <input type="hidden" name="versao" value={versaoAtual} />}

      {grupos.map((g) => (
        <fieldset key={g.titulo ?? '_'} className="flex flex-col gap-3" disabled={desabilitado}>
          {g.titulo && <legend className="mb-2 text-sm font-bold tracking-wide text-vinho uppercase">{g.titulo}</legend>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.campos.map((c) => (
              <Campo key={c.nome} rotulo={c.rotulo} nome={c.nome} erro={erros[c.nome]} ajuda={c.ajuda} obrigatorio={c.obrigatorio}
                className={clsx((c.largo || c.tipo === 'textoLongo') && 'md:col-span-2 xl:col-span-3')}>
                <CampoEntrada campo={c} id={c.nome} valor={atuais[c.nome] ?? ''} invalido={!!erros[c.nome]} desabilitado={desabilitado}
                  descritoPor={erros[c.nome] ? `${c.nome}-erro` : c.ajuda ? `${c.nome}-ajuda` : undefined} />
              </Campo>
            ))}
          </div>
        </fieldset>
      ))}

      {aviso && <p role="status" className="text-sm font-semibold text-atencao">{aviso}</p>}

      {pecas && (
        <fieldset className="flex flex-col gap-2" disabled={desabilitado}>
          <legend className="mb-2 text-sm font-bold tracking-wide text-vinho uppercase">Peças utilizadas</legend>
          <p className="text-xs text-neutro">Cada linha gera uma saída no estoque de peças vinculada a este lançamento — não lance a saída novamente no estoque.</p>
          <EditorPecas inicial={atuais.pecas ?? ''} opcoes={pecas} erro={erros.pecas} desabilitado={desabilitado} />
        </fieldset>
      )}

      {!desabilitado && (
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : rotuloEnviar}</Botao>
        </div>
      )}
    </form>
  )
}
