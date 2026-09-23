'use client'
import { useActionState } from 'react'
import { entrar } from './acoes'
import { Alerta, Botao, Campo, Entrada } from '@/components/ui'

export function FormLogin() {
  const [estado, acao, pendente] = useActionState(entrar, undefined)
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      <Campo rotulo="E-mail" nome="email" obrigatorio>
        <Entrada id="email" name="email" type="email" autoComplete="username" required />
      </Campo>
      <Campo rotulo="Senha" nome="senha" obrigatorio>
        <Entrada id="senha" name="senha" type="password" autoComplete="current-password" required />
      </Campo>
      <Botao type="submit" disabled={pendente}>{pendente ? 'Entrando…' : 'Entrar'}</Botao>
    </form>
  )
}
