import { exigirLogin } from '@/lib/auth/sessao'
import { pode, temPapel } from '@/lib/auth/permissoes'
import { Navegacao, type ItemNav } from '@/components/Navegacao'
import { Marca } from '@/components/Marca'
import { logotipoId } from '@/lib/identidade'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirLogin()
  const h = await headers()
  if (u.deveTrocarSenha && !h.get('x-cl-path')?.startsWith('/conta')) redirect('/conta/senha')
  const logo = await logotipoId()
  const itens: ItemNav[] = [
    { href: '/', rotulo: 'Dashboard executivo', grupo: 'Visão geral' },
    { href: '/fechamento', rotulo: 'Fechamento mensal', grupo: 'Visão geral' },
    { href: '/indicadores', rotulo: 'Catálogo de indicadores', grupo: 'Visão geral' },
  ]
  if (pode(u, 'dados.ler', 'MANUT_INTERNA')) itens.push({ href: '/manutencao-interna', rotulo: 'Manutenção interna', grupo: 'Áreas' })
  if (pode(u, 'dados.ler', 'MANUT_EXTERNA')) itens.push({ href: '/manutencao-externa', rotulo: 'Manutenção externa', grupo: 'Áreas' })
  if (pode(u, 'dados.ler', 'ESTOQUE_PECAS')) itens.push({ href: '/estoque-pecas', rotulo: 'Estoque de peças', grupo: 'Áreas' })
  if (pode(u, 'dados.ler', 'COMODATO')) itens.push({ href: '/comodato', rotulo: 'Comodato', grupo: 'Áreas' })
  if (pode(u, 'dados.ler', 'TI')) itens.push({ href: '/ti', rotulo: 'Tecnologia da Informação', grupo: 'Áreas' })
  itens.push({ href: '/analises', rotulo: 'Análises e destaques', grupo: 'Gestão' })
  itens.push({ href: '/planos-acao', rotulo: 'Planos de ação', grupo: 'Gestão' })
  itens.push({ href: '/metas', rotulo: 'Metas', grupo: 'Gestão' })
  if (pode(u, 'relatorio.gerar')) itens.push({ href: '/relatorios', rotulo: 'Central de relatórios', grupo: 'Gestão' })
  if (pode(u, 'cadastros.editar')) itens.push({ href: '/cadastros', rotulo: 'Cadastros', grupo: 'Administração' })
  if (pode(u, 'configuracao.editar') || pode(u, 'usuarios.gerir')) itens.push({ href: '/configuracoes', rotulo: 'Configurações e usuários', grupo: 'Administração' })
  if (pode(u, 'importacao.executar') || pode(u, 'importacao.homologar')) itens.push({ href: '/importacao', rotulo: 'Migração da planilha', grupo: 'Administração' })
  if (pode(u, 'auditoria.ler')) itens.push({ href: '/auditoria', rotulo: 'Trilha de auditoria', grupo: 'Administração' })
  itens.push({ href: '/homologacao', rotulo: 'Pendências de homologação', grupo: 'Administração' })

  const perfis = [...new Set(u.atribuicoes.map((a) => a.papel))]
  const rotuloPerfil: Record<string, string> = { ADMIN: 'Administrador', LANCADOR: 'Lançador', GESTOR: 'Gestor', DIRETORIA: 'Diretoria', AUDITOR: 'Auditor' }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="nao-imprimir flex w-full shrink-0 flex-col gap-6 bg-vinho px-3 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:overflow-y-auto">
        <div className="px-3">
          <Marca logoId={logo} />
          <p className="mt-1 text-xs text-branco/70">Sistema Gerencial Executivo</p>
        </div>
        <Navegacao itens={itens} />
        <div className="mt-auto border-t border-branco/15 px-3 pt-4 text-xs text-branco/80">
          <p className="font-semibold text-branco">{u.nome}</p>
          <p>{perfis.map((p) => rotuloPerfil[p]).join(' · ') || 'Sem perfil'}</p>
          <div className="mt-2 flex gap-3">
            <a className="underline" href="/conta/senha">Alterar senha</a>
            <form action="/api/sair" method="post"><button className="underline">Sair</button></form>
          </div>
          {temPapel(u, 'DIRETORIA') && <p className="mt-2 text-branco/60">Acesso executivo</p>}
        </div>
      </aside>
      <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  )
}
