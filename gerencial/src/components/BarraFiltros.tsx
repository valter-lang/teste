import { Suspense } from 'react'
import { SeletorCompetencia } from './SeletorCompetencia'
import { SeletorEscopo } from './SeletorEscopo'
import { opcoesCompetencia } from '@/lib/filtros'
import type { Escopo } from '@/lib/competencia'

export function BarraFiltros({ competencia, escopo, base }: { competencia: string; escopo?: Escopo; base: string }) {
  return (
    <div className="nao-imprimir mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-tinta px-4 py-2.5">
      <Suspense>
        <SeletorCompetencia valor={competencia} opcoes={opcoesCompetencia()} />
      </Suspense>
      {escopo && <SeletorEscopo atual={escopo} base={`${base}?competencia=${competencia}`} />}
    </div>
  )
}
