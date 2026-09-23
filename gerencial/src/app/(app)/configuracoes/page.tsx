import { redirect } from 'next/navigation'
import { exigirLogin } from '@/lib/auth/sessao'
import { AcessoNegado } from '@/lib/auth/permissoes'
import { abasPermitidas } from './_abas'

export default async function PaginaConfiguracoes() {
  const u = await exigirLogin()
  const abas = abasPermitidas(u)
  if (!abas.length) throw new AcessoNegado()
  redirect(abas[0].href)
}
