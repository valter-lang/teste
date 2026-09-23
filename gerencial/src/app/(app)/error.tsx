'use client'
import { Alerta, Botao } from '@/components/ui'

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl">
      <Alerta tom="critico" titulo="Não foi possível carregar esta página">
        Ocorreu um erro inesperado. Tente novamente; se persistir, avise o administrador do sistema.
      </Alerta>
      <Botao className="mt-4" onClick={reset}>Tentar novamente</Botao>
    </div>
  )
}
