import 'server-only'
import { q } from './db'

export interface ItemAnalise {
  id: number; area_codigo: string; tipo: string; fato: string; numero: string | null; indicador_codigo: string | null
  ocorrencia: string | null; responsavel: string; area_dependente: string | null; ordem: number; versao: number
}

export async function analisesDaCompetencia(comp: string, area?: string) {
  return q<ItemAnalise>(
    `select id, area_codigo, tipo, fato, numero, indicador_codigo, ocorrencia, responsavel, area_dependente, ordem, versao
       from analise_item where competencia = $1 and excluido_em is null and ($2::text is null or area_codigo = $2)
      order by area_codigo, tipo, ordem, id`, [comp, area ?? null])
}

export interface PlanoResumo {
  id: number; codigo: string; area_codigo: string; indicador_codigo: string | null; acao: string; entregavel: string
  responsavel_nome: string; prazo: string; status: string; criticidade: string; vencido: boolean
}

export async function planosAbertos(filtro: { area?: string; somenteVencidos?: boolean } = {}) {
  return q<PlanoResumo>(
    `select id, codigo, area_codigo, indicador_codigo, acao, entregavel, responsavel_nome, prazo::text, status, criticidade,
            (prazo < current_date and status in ('ABERTA','EM_ANDAMENTO')) as vencido
       from plano_acao where status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA')
        and ($1::text is null or area_codigo = $1) and (not $2 or (prazo < current_date and status in ('ABERTA','EM_ANDAMENTO')))
      order by (prazo < current_date) desc, prazo`, [filtro.area ?? null, !!filtro.somenteVencidos])
}
