'use client'
import { useActionState } from 'react'
import { Alerta, Botao, Campo, Entrada } from '@/components/ui'
import type { EstadoForm } from '@/lib/operacao/tipos'

export function EnvioAnexo({ acao, aceitos }: { acao: (prev: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>; aceitos: string[] }) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  return (
    <form key={estado?.seq ?? 0} action={enviar} className="flex flex-col gap-3">
      {estado?.ok && <Alerta tom="ok">{estado.ok}</Alerta>}
      {estado?.erro && !estado.erros?.arquivo && <Alerta tom="critico">{estado.erro}</Alerta>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Campo rotulo="Arquivo" nome="arquivo" obrigatorio erro={estado?.erros?.arquivo} ajuda={`Até 10 MB. Tipos: ${aceitos.join(', ')}.`}>
          <Entrada id="arquivo" name="arquivo" type="file" required accept={aceitos.map((x) => `.${x}`).join(',')}
            aria-describedby={estado?.erros?.arquivo ? 'arquivo-erro' : 'arquivo-ajuda'} invalido={!!estado?.erros?.arquivo} />
        </Campo>
        <Campo rotulo="Descrição" nome="descricao">
          <Entrada id="descricao" name="descricao" maxLength={300} />
        </Campo>
      </div>
      <div><Botao type="submit" variante="secundario" disabled={pendente}>{pendente ? 'Enviando…' : 'Anexar'}</Botao></div>
    </form>
  )
}

export function RemoverAnexo({ acao, nome }: { acao: (prev: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>; nome: string }) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  return (
    <form action={enviar} className="inline">
      <button type="submit" disabled={pendente} className="text-xs font-semibold text-critico underline" aria-label={`Remover anexo ${nome}`}>
        {pendente ? 'Removendo…' : 'Remover'}
      </button>
      {estado?.erro && <span role="alert" className="ml-2 text-xs text-critico">{estado.erro}</span>}
    </form>
  )
}
