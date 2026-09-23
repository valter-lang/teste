import 'server-only'
import { q, type Db } from '@/lib/db'
import { PARAMETROS } from '@/lib/cadastros/parametros'

/** Tudo que aguarda homologação, lido do banco. */
export async function pendenciasHomologacao(db?: Db) {
  const [indicadores, metas, configuracoes, importacoes, pendenciasImportacao] = await Promise.all([
    q<{ codigo: string; versao: number; nome: string; area_nome: string; classe: string; pendencias: string | null }>(
      `select d.codigo, d.versao, d.nome, a.nome as area_nome, d.classe, d.pendencias
         from indicador_definicao d join area a on a.codigo = d.area_codigo
        where not d.homologado and d.classe <> 'CANDIDATO' and d.ativo
        order by a.ordem, d.ordem`, [], db),
    q<{ id: number; indicador_codigo: string; indicador_nome: string | null; ciclo: string; tipo: string; operador: string; valor: number | null; valor_max: number | null; fonte_documento: string; motivo: string }>(
      `select m.id, m.indicador_codigo,
              (select d.nome from indicador_definicao d where d.codigo = m.indicador_codigo order by d.versao desc limit 1) as indicador_nome,
              m.ciclo, m.tipo, m.operador, m.valor, m.valor_max, m.fonte_documento, m.motivo
         from meta m where m.status = 'PROPOSTA' order by m.indicador_codigo, m.ciclo`, [], db),
    q<{ chave: string; descricao: string | null; atualizado_em: string | null }>(
      `select chave, descricao, atualizado_em from configuracao where not homologado order by chave`, [], db),
    q<{ id: number; arquivo_nome: string; status: string; criado_em: string; pendencias_abertas: number }>(
      `select i.id, i.arquivo_nome, i.status, i.criado_em,
              (select count(*)::int from importacao_pendencia p where p.importacao_id = i.id and not p.resolvida) as pendencias_abertas
         from importacao i where i.status not in ('HOMOLOGADA', 'DESCARTADA') order by i.criado_em desc`, [], db),
    q<{ tipo: string; quantidade: number }>(
      `select p.tipo, count(*)::int as quantidade
         from importacao_pendencia p join importacao i on i.id = p.importacao_id
        where not p.resolvida and i.status <> 'DESCARTADA' group by p.tipo order by quantidade desc`, [], db),
  ])
  // Parâmetros conhecidos que ainda não foram gravados (valem o padrão, sem homologação)
  const existentes = new Set((await q<{ chave: string }>('select chave from configuracao', [], db)).map((r) => r.chave))
  for (const p of PARAMETROS) {
    if (!existentes.has(p.chave)) configuracoes.push({ chave: p.chave, descricao: `${p.ajuda} (valor padrão em uso; ainda não gravado)`, atualizado_em: null })
  }
  return { indicadores, metas, configuracoes, importacoes, pendenciasImportacao }
}
