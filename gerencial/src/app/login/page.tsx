import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth/sessao'
import { FormLogin } from './FormLogin'
import { logotipoId } from '@/lib/identidade'
import { Marca } from '@/components/Marca'

export const metadata = { title: 'Entrar' }

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect('/')
  const logo = await logotipoId()
  return (
    <main id="conteudo" className="flex min-h-screen items-center justify-center bg-creme px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-pedra/60 bg-branco p-8 shadow-[var(--shadow-card)]">
        <div className="mb-6 rounded-md bg-vinho px-4 py-3"><Marca logoId={logo} /></div>
        <h1 className="text-xl font-extrabold">Sistema Gerencial Executivo</h1>
        <p className="mb-6 text-sm text-neutro">Manutenção, Estoque, Comodato e TI</p>
        <FormLogin />
      </div>
    </main>
  )
}
