import 'server-only'
import { q, q1, tx, type Db } from '@/lib/db'
import { validarCompetencia } from '@/lib/competencia'
import { dataHora } from '@/lib/format'
import { ErroNegocio, mensagemAmigavel } from '@/lib/cadastros/erros'
import type { ResultadoBaseInstalada } from './base-instalada'

export async function ultimasFotografiasIntegracao(limite = 12, db?: Db) {
  return q<{ id: number; competencia: string; equipamentos_ativos: number; clientes_ativos: number | null; evidencia: string | null; criado_em: string; criado_por_nome: string | null; excluido_em: string | null }>(
    `select b.id, b.competencia, b.equipamentos_ativos, b.clientes_ativos, b.evidencia, b.criado_em, u.nome as criado_por_nome, b.excluido_em
       from comodato_base_ativa b left join usuario u on u.id = b.criado_por
      where b.origem = 'INTEGRACAO' order by b.criado_em desc limit $1`, [limite], db)
}

/**
 * Registra a fotografia mensal da base ativa de comodato a partir da leitura da integração.
 * Recusa quando o período COMODATO está APROVADO/FECHADO (o banco também bloqueia) ou quando
 * já existe registro manual/importado para a competência. Uma fotografia anterior de integração
 * da mesma competência é substituída por exclusão lógica (histórico preservado).
 */
export async function registrarFotografiaBaseAtiva(competencia: string, leitura: ResultadoBaseInstalada, usuarioId: string, em: Date = new Date()):
  Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  if (!validarCompetencia(competencia)) return { ok: false, erro: 'Competência inválida.' }
  try {
    const id = await tx({ usuarioId, contexto: { acao: 'FOTOGRAFIA_BASE_INSTALADA' } }, async (db) => {
      const p = await q1<{ status: string }>(`select status from periodo_area where area_codigo = 'COMODATO' and competencia = $1`, [competencia], db)
      if (p && (p.status === 'APROVADO' || p.status === 'FECHADO')) {
        throw new ErroNegocio(`O período de Comodato desta competência está ${p.status === 'APROVADO' ? 'aprovado' : 'fechado'}: reabra o período com justificativa para registrar nova fotografia.`)
      }
      const existente = await q1<{ id: number; origem: string }>(
        `select id, origem from comodato_base_ativa where competencia = $1 and excluido_em is null for update`, [competencia], db)
      if (existente && existente.origem !== 'INTEGRACAO') {
        throw new ErroNegocio('Já existe base ativa lançada manualmente ou importada para esta competência. Ajuste-a na área de Comodato.')
      }
      if (existente) await db.query('update comodato_base_ativa set excluido_em = now(), versao = versao + 1 where id = $1', [existente.id])
      const r = await q1<{ id: number }>(
        `insert into comodato_base_ativa (competencia, equipamentos_ativos, clientes_ativos, origem, evidencia, criado_por)
         values ($1, $2, $3, 'INTEGRACAO', $4, $5) returning id`,
        [competencia, leitura.equipamentos, leitura.clientes, `bd_cl_inv em ${dataHora(em)}`, usuarioId], db)
      return r!.id
    })
    return { ok: true, id }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
