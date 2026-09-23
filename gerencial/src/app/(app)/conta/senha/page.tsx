import { exigirLogin } from '@/lib/auth/sessao'
import { Cabecalho, Card } from '@/components/ui'
import { FormSenha } from './FormSenha'

export const metadata = { title: 'Alterar senha' }

export default async function Pagina() {
  const u = await exigirLogin()
  return (
    <div className="max-w-lg">
      <Cabecalho titulo="Alterar senha" subtitulo={u.deveTrocarSenha ? 'Por segurança, defina uma nova senha antes de continuar.' : undefined} />
      <Card><FormSenha /></Card>
    </div>
  )
}
