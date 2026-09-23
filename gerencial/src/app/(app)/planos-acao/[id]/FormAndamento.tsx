'use client'
import { useActionState, useState } from 'react'
import { registrarAndamento } from '../acoes'
import { Alerta, AreaTexto, Botao, Campo, Entrada, Selecao } from '@/components/ui'

export function FormAndamento({ id, statusAtual, podeAprovar, podeEditar }: { id: number; statusAtual: string; podeAprovar: boolean; podeEditar: boolean }) {
  const [estado, acao, pendente] = useActionState(registrarAndamento, undefined)
  const [status, setStatus] = useState(statusAtual)
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tom="ok">{estado.ok}</Alerta>}
      <Campo rotulo="Novo status" nome="status">
        <Selecao id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {podeEditar && <><option value="ABERTA">Aberta</option><option value="EM_ANDAMENTO">Em andamento</option><option value="AGUARDANDO_EFICACIA">Aguardando eficácia</option><option value="CANCELADA">Cancelada</option></>}
          <option value="ENCERRADA">Encerrada</option>
          {!podeEditar && <option value={statusAtual}>Manter status atual</option>}
        </Selecao>
      </Campo>
      <Campo rotulo="Andamento" nome="texto" obrigatorio><AreaTexto id="texto" name="texto" required /></Campo>
      {status === 'ENCERRADA' && (
        <>
          <Campo rotulo="Evidência" nome="evidencia" obrigatorio ajuda="Descreva e anexe a evidência (documento, relatório, foto)."><AreaTexto id="evidencia" name="evidencia" required /></Campo>
          <Campo rotulo="Eficácia" nome="eficacia" obrigatorio>
            <Selecao id="eficacia" name="eficacia" required defaultValue=""><option value="" disabled>Selecione</option><option value="EFICAZ">Eficaz</option><option value="NAO_EFICAZ">Não eficaz</option></Selecao>
          </Campo>
          <Campo rotulo="Avaliação de eficácia" nome="avaliacao_eficacia" obrigatorio><Entrada id="avaliacao_eficacia" name="avaliacao_eficacia" required /></Campo>
          <Campo rotulo="Base do encerramento" nome="tipo_encerramento" obrigatorio>
            <Selecao id="tipo_encerramento" name="tipo_encerramento" required defaultValue="META_ATINGIDA">
              <option value="META_ATINGIDA">Indicador voltou à meta (verificado pelo sistema)</option>
              {podeAprovar && <option value="APROVACAO_DIRETORIA">Aprovação formal da Diretoria</option>}
            </Selecao>
          </Campo>
        </>
      )}
      <Botao type="submit" disabled={pendente}>Registrar</Botao>
    </form>
  )
}
