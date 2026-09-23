'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function SeletorCompetencia({ valor, opcoes }: { valor: string; opcoes: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold text-branco/90">Competência</span>
      <select
        value={valor}
        onChange={(e) => {
          const v = e.target.value
          try {
            document.cookie = `cl_competencia=${v}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`
          } catch {}
          const p = new URLSearchParams(sp.toString())
          p.set('competencia', v)
          p.delete('pagina')
          router.push(`${pathname}?${p.toString()}`)
        }}
        className="rounded-md border border-branco/30 bg-tinta px-2 py-1 text-sm text-branco"
      >
        {opcoes.map((c) => {
          const [y, m] = c.split('-')
          return (
            <option key={c} value={c}>
              {MESES[Number(m) - 1]}/{y}
            </option>
          )
        })}
      </select>
    </label>
  )
}
