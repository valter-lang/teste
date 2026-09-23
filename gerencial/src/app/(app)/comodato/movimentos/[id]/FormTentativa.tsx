'use client'
import { useActionState, useState } from 'react'
import { Alerta, AreaTexto, Botao, Campo, Entrada, Selecao } from '@/components/ui'
import type { EstadoForm } from '@/lib/operacao/tipos'

export function FormTentativa({ acao, hoje }: { acao: (p: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>; hoje: string }) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  const [sucesso, setSucesso] = useState(estado?.valores?.sucesso ?? '')
  const e = estado?.erros ?? {}
  const v = estado?.valores ?? {}
  return (
    <form key={estado?.seq ?? 0} action={enviar} className="flex flex-col gap-3">
      {estado?.ok && <Alerta tom="ok">{estado.ok}</Alerta>}
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Campo rotulo="Data da tentativa" nome="data" obrigatorio erro={e.data}>
          <Entrada id="data" name="data" type="date" defaultValue={v.data ?? hoje} invalido={!!e.data} aria-describedby={e.data ? 'data-erro' : undefined} />
        </Campo>
        <Campo rotulo="Resultado" nome="sucesso" obrigatorio erro={e.sucesso}>
          <Selecao id="sucesso" name="sucesso" defaultValue={v.sucesso ?? ''} onChange={(x) => setSucesso(x.target.value)} invalido={!!e.sucesso}>
            <option value="">Selecione</option>
            <option value="true">Sucesso (conclui o movimento)</option>
            <option value="false">Sem sucesso</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Encerrar como “sem êxito”" nome="marcar_sem_exito" ajuda="Somente para tentativa sem sucesso.">
          <Selecao id="marcar_sem_exito" name="marcar_sem_exito" defaultValue={v.marcar_sem_exito ?? 'false'} disabled={sucesso !== 'false'}>
            <option value="false">Não, manter em aberto</option>
            <option value="true">Sim, encerrar sem êxito</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Motivo do insucesso" nome="motivo_insucesso" erro={e.motivo_insucesso} className="md:col-span-3"
          ajuda="Obrigatório quando a tentativa não teve sucesso.">
          <AreaTexto id="motivo_insucesso" name="motivo_insucesso" rows={2} defaultValue={v.motivo_insucesso ?? ''} invalido={!!e.motivo_insucesso}
            aria-describedby={e.motivo_insucesso ? 'motivo_insucesso-erro' : 'motivo_insucesso-ajuda'} />
        </Campo>
      </div>
      <div><Botao type="submit" disabled={pendente}>{pendente ? 'Registrando…' : 'Registrar tentativa'}</Botao></div>
    </form>
  )
}

export function ExcluirTentativa({ acao, numero }: { acao: (p: EstadoForm | undefined, fd: FormData) => Promise<EstadoForm>; numero: number }) {
  const [estado, enviar, pendente] = useActionState(acao, undefined)
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-critico">Remover</summary>
      <form action={enviar} className="mt-2 flex flex-col gap-2">
        <label className="text-xs font-semibold" htmlFor={`motivo-t${numero}`}>Motivo da remoção da tentativa {numero}</label>
        <Entrada id={`motivo-t${numero}`} name="motivo" required minLength={5} className="py-1 text-xs" />
        {estado?.erro && <p role="alert" className="text-xs text-critico">{estado.erro}</p>}
        <div><Botao type="submit" variante="perigo" className="px-2 py-1 text-xs" disabled={pendente}>Confirmar</Botao></div>
      </form>
    </details>
  )
}
