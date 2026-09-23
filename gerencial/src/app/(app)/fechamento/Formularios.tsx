'use client'
import { useActionState, useState } from 'react'
import { executarTransicao, declarar } from './acoes'
import { Alerta, AreaTexto, Botao } from '@/components/ui'

const ROTULO: Record<string, string> = {
  INICIAR: 'Iniciar preenchimento', ENVIAR_VALIDACAO: 'Enviar para aprovação', DEVOLVER: 'Devolver para ajustes',
  APROVAR: 'Aprovar fechamento', FECHAR: 'Fechar e bloquear período', REABRIR: 'Reabrir período',
}
const EXIGE_JUST = ['DEVOLVER', 'REABRIR']

export function AcoesPeriodo({ area, competencia, versao, acoes }: { area: string; competencia: string; versao: number; acoes: string[] }) {
  const [estado, acao, pendente] = useActionState(executarTransicao, undefined)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  if (!acoes.length) return <p className="text-xs text-neutro">Nenhuma ação disponível para o seu perfil nesta etapa.</p>
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="area" value={area} />
      <input type="hidden" name="competencia" value={competencia} />
      <input type="hidden" name="versao" value={versao} />
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tom="ok">{estado.ok}</Alerta>}
      {escolhida && EXIGE_JUST.includes(escolhida) && (
        <label className="text-sm font-semibold">
          Justificativa (obrigatória, registrada na auditoria)
          <AreaTexto name="justificativa" required minLength={15} className="mt-1" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {acoes.map((a) => (
          <Botao key={a} type={EXIGE_JUST.includes(a) && escolhida !== a ? 'button' : 'submit'} name="acao" value={a} disabled={pendente}
            variante={a === 'REABRIR' || a === 'DEVOLVER' ? 'perigo' : a === 'APROVAR' || a === 'FECHAR' ? 'destaque' : 'primario'}
            onClick={() => setEscolhida(a)}>
            {EXIGE_JUST.includes(a) && escolhida !== a ? `${ROTULO[a]}…` : ROTULO[a]}
          </Botao>
        ))}
      </div>
    </form>
  )
}

export function Declaracao({ area, competencia, chave, rotulo }: { area: string; competencia: string; chave: string; rotulo: string }) {
  const [estado, acao, pendente] = useActionState(declarar, undefined)
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="area" value={area} /><input type="hidden" name="competencia" value={competencia} /><input type="hidden" name="chave" value={chave} />
      <Botao variante="secundario" disabled={pendente}>{rotulo}</Botao>
      {estado?.erro && <span className="text-critico">{estado.erro}</span>}
      {estado?.ok && <span className="text-ok">✓ {estado.ok}</span>}
    </form>
  )
}
