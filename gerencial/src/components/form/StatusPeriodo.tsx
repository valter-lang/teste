import { competenciaLonga } from '@/lib/format'
import { periodoBloqueado, ROTULO_STATUS_PERIODO, type StatusPeriodoArea } from '@/lib/operacao/periodo'
import { Etiqueta } from '@/components/ui'

const ICONE: Record<StatusPeriodoArea, string> = {
  RASCUNHO: '○', EM_PREENCHIMENTO: '✎', EM_VALIDACAO: '…', APROVADO: '✓', FECHADO: '■',
}

/** Situação do fechamento da competência (texto + ícone, nunca só cor). */
export function StatusPeriodo({ competencia, status }: { competencia: string; status: StatusPeriodoArea }) {
  const bloq = periodoBloqueado(status)
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <span className="font-semibold">Competência {competenciaLonga(competencia)}</span>
      <Etiqueta tom={bloq ? 'critico' : status === 'EM_VALIDACAO' ? 'atencao' : 'neutro'}>
        <span aria-hidden className="mr-1">{ICONE[status]}</span>Período {ROTULO_STATUS_PERIODO[status].toLowerCase()}
      </Etiqueta>
      {bloq && <span className="text-xs text-neutro">Edição bloqueada: reabra o período no fechamento mensal para alterar.</span>}
    </p>
  )
}
