import Link from 'next/link'
import clsx from 'clsx'
import type { Resultado } from '@/lib/indicadores/motor'
import { Semaforo } from './ui'
import { valorIndicador, variacao, dataHora, NAO_APLICAVEL } from '@/lib/format'
import { rotuloEscopo, somarMeses } from '@/lib/competencia'

const ROTULO_FONTE: Record<string, string> = { EVENTOS: 'Lançamentos do sistema', HISTORICO: 'Histórico migrado (planilha)', MISTO: 'Histórico + lançamentos', NENHUMA: 'Sem fonte' }

function comparacao(r: Resultado, ref: string): string {
  if (r.escopo === 'MES') return `vs ${rotuloEscopo(somarMeses(ref, -1), 'MES')}`
  if (r.escopo === 'ANO') return `vs mesmo período de ${Number(ref.slice(0, 4)) - 1}`
  return `vs ${r.escopo === 'TRIMESTRE' ? 'trimestre' : 'semestre'} anterior`
}

/** Cartão de indicador: valor, unidade, meta, status (texto+ícone), variação, período de comparação, fonte, atualização e "Ver cálculo". */
export function KpiCard({ r, competencia, compacto }: { r: Resultado; competencia: string; compacto?: boolean }) {
  const semDado = r.situacao !== 'OK'
  const borda = { VERDE: 'border-l-ok', AMARELO: 'border-l-dourado', VERMELHO: 'border-l-vermelho', SEM_META: 'border-l-pedra', NA: 'border-l-pedra' }[r.status]
  const casasVar = r.unidade === 'qtd' ? 0 : r.casas
  return (
    <article className={clsx('flex flex-col gap-2 rounded-[var(--radius-card)] border border-l-4 border-pedra/60 bg-branco p-4 shadow-[var(--shadow-card)]', borda)}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm leading-snug font-bold text-tinta">{r.nome}</h3>
        <Semaforo status={r.status} />
      </header>
      <p className={clsx('font-titulo tabular text-3xl font-extrabold', semDado ? 'text-lg text-neutro' : 'text-escuro')}>
        {semDado ? (r.situacao === 'NAO_APLICAVEL' ? NAO_APLICAVEL : 'Não informado') : valorIndicador(r.valor, r.unidade, r.casas)}
      </p>
      {semDado && r.motivo && <p className="text-xs text-neutro">{r.motivo}</p>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-neutro">Meta</dt>
        <dd className="text-right font-semibold text-dourado-escuro">{r.metaDescricao ?? 'Sem meta homologada'}</dd>
        {!compacto && (
          <>
            <dt className="text-neutro">Variação {comparacao(r, competencia)}</dt>
            <dd className="text-right font-semibold tabular">
              {r.variacaoAbs === null ? NAO_APLICAVEL : `${variacao(r.variacaoAbs, casasVar)}${r.variacaoPct !== null ? ` (${variacao(r.variacaoPct, 1)}%)` : ''}`}
            </dd>
            <dt className="text-neutro">Período</dt>
            <dd className="text-right">{rotuloEscopo(competencia, r.escopo)}</dd>
            <dt className="text-neutro">Fonte</dt>
            <dd className="text-right">{ROTULO_FONTE[r.fonte]}</dd>
          </>
        )}
      </dl>
      <footer className="mt-auto flex items-center justify-between border-t border-pedra/50 pt-2 text-[11px] text-neutro">
        <span>Atualizado {dataHora(r.calculadoEm)}</span>
        <Link className="font-semibold text-vinho underline-offset-2 hover:underline" href={`/indicadores/${r.codigo}?competencia=${competencia}&escopo=${r.escopo}`}>
          Ver cálculo →
        </Link>
      </footer>
    </article>
  )
}
