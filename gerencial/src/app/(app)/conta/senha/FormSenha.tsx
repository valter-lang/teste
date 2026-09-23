'use client'
import { useActionState } from 'react'
import { alterarSenha } from './acoes'
import { Alerta, Botao, Campo, Entrada } from '@/components/ui'

export function FormSenha() {
  const [estado, acao, pendente] = useActionState(alterarSenha, undefined)
  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      <Campo rotulo="Senha atual" nome="atual" obrigatorio><Entrada id="atual" name="atual" type="password" autoComplete="current-password" required /></Campo>
      <Campo rotulo="Nova senha" nome="nova" obrigatorio ajuda="Mínimo de 10 caracteres, com letras e números.">
        <Entrada id="nova" name="nova" type="password" autoComplete="new-password" required />
      </Campo>
      <Campo rotulo="Confirmar nova senha" nome="confirmacao" obrigatorio><Entrada id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" required /></Campo>
      <Botao type="submit" disabled={pendente}>Salvar nova senha</Botao>
    </form>
  )
}
