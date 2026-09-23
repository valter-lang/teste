'use client'
import { useActionState } from 'react'
import { Botao } from '@/components/ui'
import type { EstadoForm } from '@/lib/operacao/tipos'

/** Botão que dispara uma server action sem campos e mostra o resultado. */
export function BotaoAcao({ acao, rotulo, variante = 'secundario', desabilitado }: {
  acao: (p: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>
  rotulo: string
  variante?: 'primario' | 'secundario'
  desabilitado?: boolean
}) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3">
      <Botao type="submit" variante={variante} disabled={pendente || desabilitado}>{pendente ? 'Processando…' : rotulo}</Botao>
      {estado?.ok && <span role="status" className="text-sm font-semibold text-ok">✓ {estado.ok}</span>}
      {estado?.erro && <span role="alert" className="text-sm font-semibold text-critico">✗ {estado.erro}</span>}
    </form>
  )
}
