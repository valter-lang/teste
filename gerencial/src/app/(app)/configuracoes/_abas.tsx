import { Abas, Cabecalho, Etiqueta } from '@/components/ui'
import { pode, type UsuarioSessao } from '@/lib/auth/permissoes'

export type AbaConfig = 'usuarios' | 'calendario' | 'parametros' | 'identidade' | 'integracoes'

export function abasPermitidas(u: UsuarioSessao) {
  const itens: { id: AbaConfig; rotulo: string; href: string }[] = []
  if (pode(u, 'usuarios.gerir')) itens.push({ id: 'usuarios', rotulo: 'Usuários', href: '/configuracoes/usuarios' })
  if (pode(u, 'configuracao.editar')) {
    itens.push(
      { id: 'calendario', rotulo: 'Calendário', href: '/configuracoes/calendario' },
      { id: 'parametros', rotulo: 'Parâmetros', href: '/configuracoes/parametros' },
      { id: 'identidade', rotulo: 'Identidade visual', href: '/configuracoes/identidade' },
      { id: 'integracoes', rotulo: 'Integrações', href: '/configuracoes/integracoes' },
    )
  }
  return itens
}

export function CabecalhoConfig({ u, ativo, subtitulo }: { u: UsuarioSessao; ativo: AbaConfig; subtitulo?: string }) {
  return (
    <>
      <Cabecalho titulo="Configurações e usuários" subtitulo={subtitulo} />
      <Abas itens={abasPermitidas(u)} ativo={ativo} />
    </>
  )
}

export function SeloHomologacao({ homologado }: { homologado: boolean }) {
  return homologado ? <Etiqueta tom="ok">✓ Homologado</Etiqueta> : <Etiqueta tom="atencao">! Pendente de homologação</Etiqueta>
}
