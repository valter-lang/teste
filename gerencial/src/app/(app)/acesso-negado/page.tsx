import { BotaoLink, Cabecalho, Card } from '@/components/ui'

export const metadata = { title: 'Acesso negado' }

export default function AcessoNegado() {
  return (
    <div className="max-w-xl">
      <Cabecalho titulo="Acesso negado" />
      <Card>
        <p className="mb-4 text-sm">Seu perfil não tem permissão para esta página ou área. Se precisar do acesso, peça ao administrador do sistema.</p>
        <BotaoLink href="/" variante="primario">Voltar ao dashboard</BotaoLink>
      </Card>
    </div>
  )
}
