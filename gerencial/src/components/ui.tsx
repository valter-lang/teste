import Link from 'next/link'
import clsx from 'clsx'
import type { ReactNode, ComponentProps } from 'react'

/* ------------------------------------------------------------------ */
/* Estrutura                                                           */
/* ------------------------------------------------------------------ */

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-neutro">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

export function Card({ children, className, titulo, acoes, id }: { children: ReactNode; className?: string; titulo?: ReactNode; acoes?: ReactNode; id?: string }) {
  return (
    <section id={id} className={clsx('rounded-[var(--radius-card)] border border-pedra/60 bg-branco p-5 shadow-[var(--shadow-card)]', className)}>
      {(titulo || acoes) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-bold">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  )
}

export function Grade({ children, cols = 3, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }[cols]
  return <div className={clsx('grid grid-cols-1 gap-4', c, className)}>{children}</div>
}

/* ------------------------------------------------------------------ */
/* Botões                                                              */
/* ------------------------------------------------------------------ */

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'destaque'
const estilosBotao: Record<Variante, string> = {
  primario: 'bg-vinho text-branco hover:bg-tinta',
  destaque: 'bg-vermelho text-branco hover:bg-vinho',
  secundario: 'border border-pedra bg-branco text-tinta hover:bg-creme',
  perigo: 'border border-critico bg-branco text-critico hover:bg-critico-fundo',
  fantasma: 'text-vinho hover:bg-creme',
}
const baseBotao =
  'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'

export function Botao({ variante = 'primario', className, ...p }: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={clsx(baseBotao, estilosBotao[variante], className)} {...p} />
}

export function BotaoLink({ variante = 'secundario', className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={clsx(baseBotao, estilosBotao[variante], className)} {...p} />
}

/* ------------------------------------------------------------------ */
/* Semáforo (nunca apenas cor: ícone + texto)                          */
/* ------------------------------------------------------------------ */

export type StatusIndicador = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'SEM_META' | 'NA'

const STATUS: Record<StatusIndicador, { texto: string; icone: string; classe: string }> = {
  VERDE: { texto: 'Na meta', icone: '✓', classe: 'bg-ok-fundo text-ok border-ok/40' },
  AMARELO: { texto: 'Atenção', icone: '!', classe: 'bg-atencao-fundo text-atencao border-atencao/40' },
  VERMELHO: { texto: 'Fora da meta', icone: '▲', classe: 'bg-critico-fundo text-critico border-critico/40' },
  SEM_META: { texto: 'Sem meta homologada', icone: '–', classe: 'bg-neutro-fundo text-neutro border-pedra' },
  NA: { texto: 'N/A', icone: '?', classe: 'bg-neutro-fundo text-neutro border-pedra' },
}

export function Semaforo({ status, compacto }: { status: StatusIndicador; compacto?: boolean }) {
  const s = STATUS[status]
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap', s.classe)}
      title={s.texto}
    >
      <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px]">
        {s.icone}
      </span>
      {compacto && status !== 'NA' ? <span className="sr-only">{s.texto}</span> : s.texto}
    </span>
  )
}
export const textoStatus = (s: StatusIndicador) => STATUS[s].texto

export function Etiqueta({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'vinho' | 'dourado' | 'ok' | 'atencao' | 'critico' }) {
  const t = {
    neutro: 'bg-neutro-fundo text-neutro',
    vinho: 'bg-rosa-claro text-vinho',
    dourado: 'bg-dourado/25 text-dourado-escuro',
    ok: 'bg-ok-fundo text-ok',
    atencao: 'bg-atencao-fundo text-atencao',
    critico: 'bg-critico-fundo text-critico',
  }[tom]
  return <span className={clsx('inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold', t)}>{children}</span>
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

export function Campo({ rotulo, nome, erro, ajuda, obrigatorio, children, className }: {
  rotulo: string; nome: string; erro?: string; ajuda?: string; obrigatorio?: boolean; children: ReactNode; className?: string
}) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={nome} className="text-sm font-semibold text-tinta">
        {rotulo} {obrigatorio && <span className="text-critico" aria-hidden>*</span>}
        {obrigatorio && <span className="sr-only">(obrigatório)</span>}
      </label>
      {children}
      {ajuda && !erro && <p id={`${nome}-ajuda`} className="text-xs text-neutro">{ajuda}</p>}
      {erro && <p id={`${nome}-erro`} role="alert" className="text-xs font-semibold text-critico">{erro}</p>}
    </div>
  )
}

const baseInput =
  'w-full rounded-md border border-pedra bg-branco px-3 py-2 text-sm text-escuro placeholder:text-neutro/70 focus:border-vinho disabled:bg-creme'

export function Entrada({ className, invalido, ...p }: ComponentProps<'input'> & { invalido?: boolean }) {
  return <input aria-invalid={invalido || undefined} className={clsx(baseInput, invalido && 'border-critico', className)} {...p} />
}
export function Selecao({ className, invalido, children, ...p }: ComponentProps<'select'> & { invalido?: boolean }) {
  return <select aria-invalid={invalido || undefined} className={clsx(baseInput, invalido && 'border-critico', className)} {...p}>{children}</select>
}
export function AreaTexto({ className, invalido, ...p }: ComponentProps<'textarea'> & { invalido?: boolean }) {
  return <textarea aria-invalid={invalido || undefined} className={clsx(baseInput, 'min-h-20', invalido && 'border-critico', className)} {...p} />
}

/* ------------------------------------------------------------------ */
/* Tabela e estados                                                    */
/* ------------------------------------------------------------------ */

export function Tabela({ children, className, legenda }: { children: ReactNode; className?: string; legenda?: string }) {
  return (
    <div className={clsx('overflow-x-auto rounded-md border border-pedra/70', className)}>
      <table className="w-full border-collapse text-sm tabular">
        {legenda && <caption className="sr-only">{legenda}</caption>}
        {children}
      </table>
    </div>
  )
}
export function Th({ children, className, alinhar = 'esquerda' }: { children?: ReactNode; className?: string; alinhar?: 'esquerda' | 'direita' | 'centro' }) {
  return (
    <th scope="col" className={clsx('sticky top-0 bg-vinho px-3 py-2 text-xs font-bold tracking-wide text-branco uppercase',
      { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' }[alinhar], className)}>
      {children}
    </th>
  )
}
export function Td({ children, className, alinhar = 'esquerda', colSpan }: { children?: ReactNode; className?: string; alinhar?: 'esquerda' | 'direita' | 'centro'; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={clsx('border-t border-pedra/50 px-3 py-2 align-top', { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' }[alinhar], className)}>
      {children}
    </td>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-pedra p-6 text-center text-sm text-neutro">{children}</div>
}

export function Alerta({ tom = 'info', titulo, children }: { tom?: 'info' | 'ok' | 'atencao' | 'critico'; titulo?: string; children: ReactNode }) {
  const t = {
    info: 'border-pedra bg-creme text-tinta',
    ok: 'border-ok/40 bg-ok-fundo text-ok',
    atencao: 'border-atencao/40 bg-atencao-fundo text-atencao',
    critico: 'border-critico/40 bg-critico-fundo text-critico',
  }[tom]
  return (
    <div role={tom === 'critico' ? 'alert' : 'status'} className={clsx('rounded-md border px-4 py-3 text-sm', t)}>
      {titulo && <p className="font-bold">{titulo}</p>}
      <div>{children}</div>
    </div>
  )
}

export function Abas({ itens, ativo }: { itens: { href: string; rotulo: string; id: string }[]; ativo: string }) {
  return (
    <nav aria-label="Seções" className="mb-5 flex flex-wrap gap-1 border-b border-pedra">
      {itens.map((i) => (
        <Link key={i.id} href={i.href} aria-current={i.id === ativo ? 'page' : undefined}
          className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
            i.id === ativo ? 'border-vermelho text-vinho' : 'border-transparent text-neutro hover:text-vinho')}>
          {i.rotulo}
        </Link>
      ))}
    </nav>
  )
}

export function Paginacao({ pagina, total, porPagina, hrefPara }: { pagina: number; total: number; porPagina: number; hrefPara: (p: number) => string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <nav aria-label="Paginação" className="mt-3 flex items-center justify-between text-sm text-neutro">
      <span>{total.toLocaleString('pt-BR')} registro(s) · página {pagina} de {paginas}</span>
      <span className="flex gap-2">
        {pagina > 1 && <Link className="font-semibold text-vinho" href={hrefPara(pagina - 1)}>← Anterior</Link>}
        {pagina < paginas && <Link className="font-semibold text-vinho" href={hrefPara(pagina + 1)}>Próxima →</Link>}
      </span>
    </nav>
  )
}
