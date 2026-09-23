'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface EstadoJob {
  id: number
  status: 'NA_FILA' | 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO'
  progresso: number
  etapa: string | null
  mensagem_erro: string | null
  arquivo_id: string | null
  arquivo_nome: string | null
  versao: number | null
  situacao_fechamento: 'OFICIAL' | 'PRELIMINAR' | null
}

const ROTULO: Record<EstadoJob['status'], string> = { NA_FILA: 'Na fila', PROCESSANDO: 'Processando', CONCLUIDO: 'Concluído', ERRO: 'Erro' }

/** Acompanha um job (consulta a cada 2 s enquanto está na fila ou em processamento). */
export function StatusJob({ inicial }: { inicial: EstadoJob }) {
  const [job, setJob] = useState(inicial)
  const router = useRouter()
  const ativo = job.status === 'NA_FILA' || job.status === 'PROCESSANDO'
  useEffect(() => {
    if (!ativo) return
    let cancelado = false
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/relatorios/${job.id}`, { cache: 'no-store' })
        if (!r.ok) return
        const novo = (await r.json()) as EstadoJob
        if (cancelado) return
        setJob(novo)
        // Ao terminar, atualiza a linha inteira (versão e selo) sem recarregar a página.
        if (novo.status === 'CONCLUIDO' || novo.status === 'ERRO') router.refresh()
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 2000)
    return () => { cancelado = true; clearInterval(t) }
  }, [ativo, job.id, router])

  return (
    <div className="flex w-56 flex-col gap-1" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        <span className={job.status === 'ERRO' ? 'text-critico' : job.status === 'CONCLUIDO' ? 'text-ok' : 'text-tinta'}>
          {job.status === 'ERRO' ? '▲ ' : job.status === 'CONCLUIDO' ? '✓ ' : ''}{ROTULO[job.status]}
        </span>
        {ativo && <span className="tabular text-neutro">{job.progresso}%</span>}
      </div>
      {ativo && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutro-fundo" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progresso} aria-label="Progresso da geração">
          <div className="h-full rounded-full bg-vinho transition-all" style={{ width: `${Math.max(4, job.progresso)}%` }} />
        </div>
      )}
      {job.etapa && ativo && <span className="text-xs text-neutro">{job.etapa}</span>}
      {job.status === 'ERRO' && job.mensagem_erro && <span className="text-xs text-critico">{job.mensagem_erro}</span>}
      {job.status === 'CONCLUIDO' && job.arquivo_id && (
        <a className="text-sm font-semibold text-vinho underline" href={`/api/arquivos/${job.arquivo_id}`} download title={job.arquivo_nome ?? undefined}>
          Baixar arquivo
          <span className="block text-xs font-normal break-all text-neutro no-underline">{job.arquivo_nome}</span>
        </a>
      )}
    </div>
  )
}
