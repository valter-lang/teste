'use client'
import { useActionState } from 'react'
import { Alerta, Botao, BotaoLink, Campo, Entrada, Selecao } from '@/components/ui'
import { UFS, type CampoDef } from '@/lib/cadastros/definicoes'
import type { EstadoAcao } from '@/lib/cadastros/acao'

export type OpcaoRef = { id: number; rotulo: string; ativo: boolean }

export function FormCadastro({ campos, valores, opcoes, acao, rotuloBotao, cancelarHref, somenteLeitura, voltar }: {
  campos: CampoDef[]
  valores: Record<string, unknown>
  opcoes: Record<string, OpcaoRef[]>
  acao: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>
  rotuloBotao: string
  cancelarHref: string
  somenteLeitura?: boolean
  /** Página de retorno após salvar (deve começar com /cadastros/). */
  voltar?: string
}) {
  const [estado, executar, pendente] = useActionState(acao, undefined)
  const atuais = estado?.valores ?? valores
  const erros = estado?.erros ?? {}
  return (
    <form action={executar} key={JSON.stringify(estado?.valores ?? null)} className="flex flex-col gap-4" noValidate>
      {voltar && <input type="hidden" name="_voltar" value={voltar} />}
      {estado?.erro && <Alerta tom="critico" titulo="Não foi possível salvar">{estado.erro}</Alerta>}
      {Object.keys(erros).length > 0 && !estado?.erro && (
        <Alerta tom="critico" titulo="Revise os campos destacados">{Object.keys(erros).length} campo(s) com problema.</Alerta>
      )}
      <fieldset disabled={somenteLeitura || pendente} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <legend className="sr-only">Dados do cadastro</legend>
        {campos.map((c) => (
          <CampoCadastro key={c.nome} campo={c} valor={atuais[c.nome]} erro={erros[c.nome]} opcoes={opcoes[c.nome] ?? []} />
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {!somenteLeitura && <Botao type="submit" disabled={pendente}>{pendente ? 'Salvando…' : rotuloBotao}</Botao>}
        <BotaoLink href={cancelarHref}>{somenteLeitura ? 'Voltar' : 'Cancelar'}</BotaoLink>
      </div>
    </form>
  )
}

function CampoCadastro({ campo: c, valor, erro, opcoes }: { campo: CampoDef; valor: unknown; erro?: string; opcoes: OpcaoRef[] }) {
  const v = valor === null || valor === undefined ? (typeof c.padrao === 'string' ? c.padrao : '') : String(valor)
  const desc = erro ? `${c.nome}-erro` : c.ajuda ? `${c.nome}-ajuda` : undefined
  const comum = { id: c.nome, name: c.nome, invalido: !!erro, 'aria-describedby': desc, required: c.obrigatorio }
  if (c.tipo === 'booleano') {
    const marcado = valor === null || valor === undefined ? c.padrao === true : valor === true || valor === 'true' || valor === 'on'
    return (
      <div className="flex flex-col gap-1 md:col-span-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-tinta">
          <input type="checkbox" id={c.nome} name={c.nome} defaultChecked={marcado} className="h-4 w-4 accent-vinho" aria-describedby={desc} />
          {c.rotulo}
        </label>
        {c.ajuda && !erro && <p id={`${c.nome}-ajuda`} className="text-xs text-neutro">{c.ajuda}</p>}
        {erro && <p id={`${c.nome}-erro`} role="alert" className="text-xs font-semibold text-critico">{erro}</p>}
      </div>
    )
  }
  let controle
  switch (c.tipo) {
    case 'selecao':
      controle = (
        <Selecao {...comum} defaultValue={v}>
          <option value="">{c.obrigatorio ? '— selecione —' : '— não informado —'}</option>
          {c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </Selecao>
      )
      break
    case 'uf':
      controle = (
        <Selecao {...comum} defaultValue={v}>
          <option value="">— não informado —</option>
          {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
        </Selecao>
      )
      break
    case 'referencia':
      controle = (
        <Selecao {...comum} defaultValue={v}>
          <option value="">{c.obrigatorio ? '— selecione —' : '— nenhum —'}</option>
          {opcoes.map((o) => <option key={o.id} value={String(o.id)}>{o.rotulo}{o.ativo ? '' : ' (desativado)'}</option>)}
        </Selecao>
      )
      break
    case 'data':
      controle = <Entrada {...comum} type="date" defaultValue={v.slice(0, 10)} />
      break
    case 'inteiro':
      controle = <Entrada {...comum} type="number" step={1} min={c.min} inputMode="numeric" defaultValue={v} />
      break
    case 'decimal':
      controle = <Entrada {...comum} type="text" inputMode="decimal" defaultValue={v.replace('.', ',')} placeholder="0,000" />
      break
    default:
      controle = <Entrada {...comum} type="text" maxLength={c.max} defaultValue={v} autoComplete="off" />
  }
  return (
    <Campo rotulo={c.rotulo} nome={c.nome} erro={erro} ajuda={c.ajuda} obrigatorio={c.obrigatorio}>
      {controle}
    </Campo>
  )
}
