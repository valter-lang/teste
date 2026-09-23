import 'server-only'
import { exigirPermissao } from '@/lib/auth/sessao'
import type { Acao, UsuarioSessao } from '@/lib/auth/permissoes'
import { ehErroDeFluxoNext, mensagemAmigavel } from './erros'

/** Estado devolvido pelas server actions aos formulários (useActionState). */
export type EstadoAcao = {
  ok?: boolean
  erro?: string
  erros?: Record<string, string>
  mensagem?: string
  /** Senha temporária: exibida uma única vez, nunca persistida em claro. */
  senhaTemporaria?: string
  valores?: Record<string, unknown>
} | undefined

/**
 * Executa uma ação exigindo permissão NO SERVIDOR. Erros de negócio/acesso viram mensagens;
 * redirecionamentos do Next são repassados.
 */
export async function comPermissao(acao: Acao, fn: (u: UsuarioSessao) => Promise<EstadoAcao>): Promise<EstadoAcao> {
  try {
    const u = await exigirPermissao(acao)
    if (u.deveTrocarSenha) return { erro: 'Altere sua senha temporária antes de executar ações administrativas.' }
    return await fn(u)
  } catch (e) {
    if (ehErroDeFluxoNext(e)) throw e
    return { erro: mensagemAmigavel(e) }
  }
}

export const texto = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : ''
}
export const inteiro = (fd: FormData, k: string) => {
  const n = Number(texto(fd, k))
  return Number.isInteger(n) && n > 0 ? n : null
}
