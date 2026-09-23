/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string, public campo?: string) {
    super(mensagem)
    this.name = 'ErroNegocio'
  }
}

type ErroPg = { code?: string; constraint?: string; message?: string; hint?: string; name?: string }

/**
 * Traduz um erro (de negócio, de acesso ou do banco) em mensagem legível.
 * `unicos` mapeia o nome do índice/constraint único para a mensagem amigável.
 */
export function mensagemAmigavel(e: unknown, unicos: Record<string, string> = {}): string {
  const err = e as ErroPg
  if (e instanceof ErroNegocio) return e.message
  if (err?.name === 'AcessoNegado') return err.message ?? 'Acesso negado para o seu perfil.'
  if (err?.code === '23505') {
    return (err.constraint && unicos[err.constraint]) || 'Já existe um cadastro com estes dados (valor único duplicado).'
  }
  if (err?.code === '23503') return 'Referência inválida: o cadastro relacionado não existe.'
  if (err?.code === '23514') return `Dados inconsistentes (regra ${err.constraint ?? 'de validação'}). Revise os campos.`
  if (err?.code === '22001') return 'Um dos textos excede o tamanho permitido.'
  if (err?.code === 'P0001') return err.message ?? 'Operação não permitida.'
  return 'Erro inesperado ao gravar. Tente novamente ou acione a equipe de sistemas.'
}

/** Para ações: relança erros de controle de fluxo do Next (redirect/notFound). */
export function ehErroDeFluxoNext(e: unknown): boolean {
  const d = (e as { digest?: unknown })?.digest
  return typeof d === 'string' && (d.startsWith('NEXT_REDIRECT') || d.startsWith('NEXT_HTTP_ERROR_FALLBACK') || d === 'NEXT_NOT_FOUND')
}
