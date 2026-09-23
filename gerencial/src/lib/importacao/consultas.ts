/** Consultas de leitura da migração (telas). Nunca retornam dados restritos. */
import { q, q1 } from '@/lib/db'
import type { ResumoAnalise } from './planilha'
import type { LinhaReconciliacao } from './reconciliacao'

export type StatusImportacao = 'ANALISADA' | 'GRAVADA' | 'HOMOLOGADA' | 'DESCARTADA'

export interface ImportacaoLista {
  id: number
  arquivo_nome: string
  status: StatusImportacao
  criado_em: Date
  criado_por_nome: string | null
  gravado_em: Date | null
  homologado_em: Date | null
  homologado_por_nome: string | null
  pendencias_abertas: number
}

export async function listarImportacoes(): Promise<ImportacaoLista[]> {
  return q<ImportacaoLista>(
    `select i.id, i.arquivo_nome, i.status, i.criado_em, uc.nome as criado_por_nome, i.gravado_em, i.homologado_em, uh.nome as homologado_por_nome,
            (select count(*)::int from importacao_pendencia p where p.importacao_id = i.id and not p.resolvida) as pendencias_abertas
       from importacao i
       left join usuario uc on uc.id = i.criado_por
       left join usuario uh on uh.id = i.homologado_por
      order by i.id desc limit 100`)
}

export interface ImportacaoDetalhe extends ImportacaoLista {
  arquivo_sha256: string
  gravado_por_nome: string | null
  observacao_homologacao: string | null
  resumo: (ResumoAnalise & { gravacao?: { propostasAceitas: string[]; naoGravados: number }; descarte?: { motivo: string | null; em: string; status_anterior: string } }) | null
  reconciliacao: LinhaReconciliacao[] | null
}

export async function obterImportacao(id: number): Promise<ImportacaoDetalhe | undefined> {
  return q1<ImportacaoDetalhe>(
    `select i.id, i.arquivo_nome, i.arquivo_sha256, i.status, i.criado_em, uc.nome as criado_por_nome, i.gravado_em, ug.nome as gravado_por_nome,
            i.homologado_em, uh.nome as homologado_por_nome, i.observacao_homologacao, i.resumo, i.reconciliacao,
            (select count(*)::int from importacao_pendencia p where p.importacao_id = i.id and not p.resolvida) as pendencias_abertas
       from importacao i
       left join usuario uc on uc.id = i.criado_por
       left join usuario ug on ug.id = i.gravado_por
       left join usuario uh on uh.id = i.homologado_por
      where i.id = $1`, [id])
}

export interface PendenciaLista {
  id: number
  aba: string
  celula: string | null
  tipo: string
  descricao: string
  resolvida: boolean
  resolucao: string | null
  resolvido_por_nome: string | null
  resolvido_em: Date | null
}

export async function listarPendencias(importacaoId: number, tipo?: string): Promise<PendenciaLista[]> {
  return q<PendenciaLista>(
    `select p.id, p.aba, p.celula, p.tipo, p.descricao, p.resolvida, p.resolucao, u.nome as resolvido_por_nome, p.resolvido_em
       from importacao_pendencia p left join usuario u on u.id = p.resolvido_por
      where p.importacao_id = $1 and ($2::text is null or p.tipo = $2)
      order by p.resolvida, case p.tipo when 'TOTAL_INCOMPATIVEL' then 0 when 'CONCILIACAO' then 1 else 2 end, p.id`,
    [importacaoId, tipo ?? null])
}
