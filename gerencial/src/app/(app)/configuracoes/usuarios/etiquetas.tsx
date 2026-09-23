import { Etiqueta } from '@/components/ui'

export function EtiquetasUsuario({ usuario: u }: { usuario: { ativo: boolean; deve_trocar_senha: boolean; bloqueado_ate: string | null } }) {
  const bloqueado = !!u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()
  return (
    <span className="flex flex-wrap gap-1">
      {u.ativo ? <Etiqueta tom="ok">● Ativo</Etiqueta> : <Etiqueta>○ Desativado</Etiqueta>}
      {bloqueado && <Etiqueta tom="critico">🔒 Bloqueado</Etiqueta>}
      {u.deve_trocar_senha && <Etiqueta tom="atencao">! Troca de senha pendente</Etiqueta>}
    </span>
  )
}
