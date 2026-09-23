'use server'
import { redirect } from 'next/navigation'
import { exigirLogin } from '@/lib/auth/sessao'
import { ErroRelatorio, processarFilaEmSegundoPlano, solicitarRelatorio, type SolicitacaoRelatorio } from '@/lib/relatorios/fila'

/** Enfileira o relatório e volta à central sem esperar a geração. */
export async function solicitarRelatorioAcao(fd: FormData) {
  const u = await exigirLogin()
  const competencia = String(fd.get('competencia') ?? '')
  const unidades = fd.getAll('unidades').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
  const entrada = {
    competencia,
    escopo: String(fd.get('escopo') ?? 'CONSOLIDADO'),
    modo: String(fd.get('modo') ?? 'EXECUTIVO'),
    formato: String(fd.get('formato') ?? 'PPTX'),
    unidades: unidades.length ? unidades : null,
  } as SolicitacaoRelatorio
  let destino: string
  try {
    const id = await solicitarRelatorio(entrada, u)
    processarFilaEmSegundoPlano()
    destino = `/relatorios?competencia=${encodeURIComponent(competencia)}&solicitado=${id}`
  } catch (e) {
    const msg = e instanceof ErroRelatorio ? e.message : 'Não foi possível solicitar o relatório. Tente novamente.'
    if (!(e instanceof ErroRelatorio)) console.error('[relatorios] solicitação:', e)
    destino = `/relatorios?competencia=${encodeURIComponent(competencia)}&erro=${encodeURIComponent(msg)}`
  }
  redirect(destino)
}
