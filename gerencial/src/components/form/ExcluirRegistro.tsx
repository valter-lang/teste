'use client'
import { useActionState } from 'react'
import { Alerta, AreaTexto, Botao, Campo } from '@/components/ui'
import type { EstadoForm } from '@/lib/operacao/tipos'

/** Exclusão lógica com motivo obrigatório (fica na trilha de auditoria). */
export function ExcluirRegistro({ acao, versao, rotulo = 'Excluir registro', fisica }: {
  acao: (prev: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>
  versao?: number | null
  rotulo?: string
  fisica?: boolean
}) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  return (
    <details className="rounded-md border border-critico/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-critico">{rotulo}</summary>
      <form action={enviar} className="mt-3 flex flex-col gap-3">
        {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
        <p className="text-xs text-neutro">
          {fisica
            ? 'Este item de planejamento será removido; o motivo e o conteúdo anterior ficam na trilha de auditoria.'
            : 'O registro deixa de contar nos indicadores, mas permanece consultável por gestores e na trilha de auditoria.'}
        </p>
        {versao != null && <input type="hidden" name="versao" value={versao} />}
        <Campo rotulo="Motivo da exclusão" nome="motivo" obrigatorio erro={estado?.erros?.motivo}>
          <AreaTexto id="motivo" name="motivo" required minLength={5} rows={2} invalido={!!estado?.erros?.motivo}
            aria-describedby={estado?.erros?.motivo ? 'motivo-erro' : undefined} />
        </Campo>
        <div><Botao type="submit" variante="perigo" disabled={pendente}>{pendente ? 'Excluindo…' : 'Confirmar exclusão'}</Botao></div>
      </form>
    </details>
  )
}
