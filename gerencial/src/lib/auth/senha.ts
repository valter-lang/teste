import bcrypt from 'bcryptjs'

export const hashSenha = (s: string) => bcrypt.hash(s, 12)
export const conferirSenha = (s: string, h: string) => bcrypt.compare(s, h)

/** Política mínima: 10+ caracteres, letras e números. */
export function validarPoliticaSenha(s: string): string | null {
  if (s.length < 10) return 'A senha deve ter pelo menos 10 caracteres.'
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'A senha deve conter letras e números.'
  return null
}
