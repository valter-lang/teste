'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

export interface ItemNav { href: string; rotulo: string; grupo: string }

export function Navegacao({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname()
  const grupos = [...new Set(itens.map((i) => i.grupo))]
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-4">
      {grupos.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-[11px] font-bold tracking-widest text-branco/50 uppercase">{g}</p>
          <ul className="flex flex-col gap-0.5">
            {itens.filter((i) => i.grupo === g).map((i) => {
              const ativo = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={ativo ? 'page' : undefined}
                    className={clsx('block rounded-md px-3 py-1.5 text-sm font-medium',
                      ativo ? 'bg-branco/15 text-branco' : 'text-branco/80 hover:bg-branco/10 hover:text-branco')}>
                    {i.rotulo}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
