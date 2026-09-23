import { Abas } from './ui'
import type { AreaCodigo } from '@/lib/auth/permissoes'

/** Seções de cada área (painel analítico + telas de lançamento). */
export const SECOES_AREA: Record<AreaCodigo, { id: string; rotulo: string; href: string }[]> = {
  MANUT_INTERNA: [
    { id: 'painel', rotulo: 'Painel', href: '/manutencao-interna' },
    { id: 'lancamentos', rotulo: 'Lançamentos da oficina', href: '/manutencao-interna/lancamentos' },
    { id: 'preventivas', rotulo: 'Plano de preventivas', href: '/manutencao-interna/preventivas' },
    { id: 'historico', rotulo: 'Histórico migrado', href: '/manutencao-interna/historico' },
  ],
  MANUT_EXTERNA: [
    { id: 'painel', rotulo: 'Painel', href: '/manutencao-externa' },
    { id: 'chamados', rotulo: 'Chamados', href: '/manutencao-externa/chamados' },
    { id: 'trocas', rotulo: 'Trocas de equipamento', href: '/manutencao-externa/trocas' },
    { id: 'historico', rotulo: 'Histórico migrado', href: '/manutencao-externa/historico' },
  ],
  ESTOQUE_PECAS: [
    { id: 'painel', rotulo: 'Painel', href: '/estoque-pecas' },
    { id: 'movimentos', rotulo: 'Movimentações', href: '/estoque-pecas/movimentos' },
    { id: 'saldos', rotulo: 'Saldos calculados', href: '/estoque-pecas/saldos' },
    { id: 'historico', rotulo: 'Histórico migrado', href: '/estoque-pecas/historico' },
  ],
  COMODATO: [
    { id: 'painel', rotulo: 'Painel', href: '/comodato' },
    { id: 'movimentos', rotulo: 'Entregas, trocas e retiradas', href: '/comodato/movimentos' },
    { id: 'posicao', rotulo: 'Posição mensal do estoque', href: '/comodato/posicao' },
    { id: 'base', rotulo: 'Base ativa e consumo', href: '/comodato/base' },
    { id: 'historico', rotulo: 'Histórico migrado', href: '/comodato/historico' },
  ],
  TI: [
    { id: 'painel', rotulo: 'Painel', href: '/ti' },
    { id: 'chamados', rotulo: 'Chamados', href: '/ti/chamados' },
    { id: 'disponibilidade', rotulo: 'Disponibilidade', href: '/ti/disponibilidade' },
    { id: 'continuidade', rotulo: 'Backup e restauração', href: '/ti/continuidade' },
    { id: 'incidentes', rotulo: 'Incidentes críticos', href: '/ti/incidentes' },
    { id: 'projetos', rotulo: 'Projetos e entregas', href: '/ti/projetos' },
    { id: 'patches', rotulo: 'Patches e segurança', href: '/ti/patches' },
  ],
}

export function AbasArea({ area, ativo, query }: { area: AreaCodigo; ativo: string; query?: string }) {
  const itens = SECOES_AREA[area].map((s) => ({ ...s, href: query ? `${s.href}?${query}` : s.href }))
  return <Abas itens={itens} ativo={ativo} />
}
