'use client'
import { useActionState } from 'react'
import { Botao } from '@/components/ui'
import type { EstadoAcao } from '@/lib/cadastros/acao'

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'destaque'

/**
 * Botão que submete uma server action com campos ocultos, com confirmação opcional
 * e mensagem de retorno acessível (role=status/alert).
 */
export function AcaoRapida({ acao, campos, rotulo, variante = 'secundario', confirmar, rotuloAcessivel }: {
  acao: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>
  campos: Record<string, string>
  rotulo: string
  variante?: Variante
  confirmar?: string
  rotuloAcessivel?: string
}) {
  const [estado, executar, pendente] = useActionState(acao, undefined)
  return (
    <form
      action={executar}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault() }}
    >
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Botao type="submit" variante={variante} disabled={pendente} aria-label={rotuloAcessivel} className="px-2.5 py-1 text-xs">
        {pendente ? 'Aguarde…' : rotulo}
      </Botao>
      {estado?.erro && <span role="alert" className="max-w-64 text-xs font-semibold text-critico">✖ {estado.erro}</span>}
      {estado?.mensagem && !estado.erro && <span role="status" className="text-xs font-semibold text-ok">✓ {estado.mensagem}</span>}
      {estado?.senhaTemporaria && <SenhaTemporaria senha={estado.senhaTemporaria} />}
    </form>
  )
}

/** Exibe a senha temporária uma única vez (não é armazenada em claro em lugar algum). */
export function SenhaTemporaria({ senha }: { senha: string }) {
  return (
    <div role="status" className="mt-1 rounded-md border border-atencao/40 bg-atencao-fundo p-3 text-sm text-atencao">
      <p className="font-bold">⚠ Senha temporária — anote agora, ela não será exibida novamente:</p>
      <p className="mt-1 select-all rounded bg-branco px-2 py-1 font-mono text-base text-escuro" aria-label="Senha temporária">{senha}</p>
      <p className="mt-1 text-xs">Entregue ao usuário por canal seguro. A troca será exigida no primeiro acesso.</p>
    </div>
  )
}
