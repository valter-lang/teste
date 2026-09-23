'use client'
import { useActionState, type ReactNode } from 'react'
import { Alerta, Botao } from '@/components/ui'
import type { EstadoAcao } from '@/lib/cadastros/acao'
import { SenhaTemporaria } from './AcaoRapida'

/** Formulário genérico ligado a uma server action, com mensagens acessíveis. */
export function FormAcao({ acao, children, rotuloBotao, className, variante = 'primario', confirmar }: {
  acao: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>
  children: ReactNode
  rotuloBotao: string
  className?: string
  variante?: 'primario' | 'secundario' | 'perigo' | 'destaque'
  confirmar?: string
}) {
  const [estado, executar, pendente] = useActionState(acao, undefined)
  return (
    <form action={executar} className={className ?? 'flex flex-col gap-3'}
      onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault() }}>
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      {estado?.erros && !estado.erro && <Alerta tom="critico">{Object.values(estado.erros).join(' ')}</Alerta>}
      {estado?.mensagem && !estado.erro && <Alerta tom="ok">✓ {estado.mensagem}</Alerta>}
      {estado?.senhaTemporaria && <SenhaTemporaria senha={estado.senhaTemporaria} />}
      <fieldset disabled={pendente} className="contents">{children}</fieldset>
      <div>
        <Botao type="submit" variante={variante} disabled={pendente}>{pendente ? 'Aguarde…' : rotuloBotao}</Botao>
      </div>
    </form>
  )
}
