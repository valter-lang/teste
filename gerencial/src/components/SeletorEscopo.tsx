import Link from 'next/link'
import clsx from 'clsx'
import type { Escopo } from '@/lib/competencia'

const OPCOES: { v: Escopo; r: string }[] = [
  { v: 'MES', r: 'Mês' }, { v: 'TRIMESTRE', r: 'Trimestre' }, { v: 'SEMESTRE', r: 'Semestre' }, { v: 'ANO', r: 'Acumulado do ano' },
]

export function SeletorEscopo({ atual, base }: { atual: Escopo; base: string }) {
  const sep = base.includes('?') ? '&' : '?'
  return (
    <nav aria-label="Período de análise" className="inline-flex rounded-md border border-pedra bg-branco p-0.5 text-sm">
      {OPCOES.map((o) => (
        <Link key={o.v} href={`${base}${sep}escopo=${o.v}`} aria-current={o.v === atual ? 'true' : undefined}
          className={clsx('rounded px-3 py-1 font-semibold', o.v === atual ? 'bg-vinho text-branco' : 'text-tinta hover:bg-creme')}>
          {o.r}
        </Link>
      ))}
    </nav>
  )
}

export function escopoDe(v: string | string[] | undefined): Escopo {
  const s = Array.isArray(v) ? v[0] : v
  return (['MES', 'TRIMESTRE', 'SEMESTRE', 'ANO'] as const).includes(s as Escopo) ? (s as Escopo) : 'MES'
}
