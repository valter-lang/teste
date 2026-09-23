import 'server-only'
import { z } from 'zod'
import { q, q1, tx, type Db } from '@/lib/db'
import { ErroNegocio, mensagemAmigavel } from './erros'
import { parametroPorChave, validarExpediente, validarParametro, type Expediente } from './parametros'

export interface LinhaConfiguracao {
  chave: string; valor: unknown; descricao: string | null; homologado: boolean
  atualizado_em: string; atualizado_por_nome: string | null
}

export async function lerConfiguracoes(chaves: string[], db?: Db): Promise<Map<string, LinhaConfiguracao>> {
  const rows = await q<LinhaConfiguracao>(
    `select c.chave, c.valor, c.descricao, c.homologado, c.atualizado_em, u.nome as atualizado_por_nome
       from configuracao c left join usuario u on u.id = c.atualizado_por where c.chave = any($1)`, [chaves], db)
  return new Map(rows.map((r) => [r.chave, r]))
}

type R = { ok: true } | { ok: false; erro: string }

/** Grava valor (e o indicador de homologação) de um parâmetro conhecido. Cria a chave se ainda não existir. */
export async function salvarParametro(chave: string, entrada: { valor?: string | null; valores?: string[] }, homologado: boolean, usuarioId: string): Promise<R> {
  const def = parametroPorChave(chave)
  if (!def) return { ok: false, erro: 'Parâmetro desconhecido.' }
  const v = validarParametro(chave, entrada)
  if (!v.ok) return v
  try {
    await tx({ usuarioId }, (db) => db.query(
      `insert into configuracao (chave, valor, descricao, homologado, atualizado_em, atualizado_por)
       values ($1, $2::jsonb, $3, $4, now(), $5)
       on conflict (chave) do update set valor = excluded.valor, homologado = excluded.homologado,
         atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [chave, JSON.stringify(v.valor), def.ajuda, homologado, usuarioId]))
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/** Grava o expediente oficial. Qualquer alteração retira a homologação (precisa ser homologado novamente). */
export async function salvarExpediente(entrada: { fuso?: string; dias?: string[]; inicio?: string; fim?: string }, usuarioId: string): Promise<R> {
  const v = validarExpediente(entrada)
  if (!v.ok) return v
  try {
    await tx({ usuarioId }, (db) => db.query(
      `insert into configuracao (chave, valor, descricao, homologado, atualizado_em, atualizado_por)
       values ('calendario.expediente', $1::jsonb, 'Expediente oficial para horas úteis.', false, now(), $2)
       on conflict (chave) do update set valor = excluded.valor, homologado = false, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [JSON.stringify(v.valor satisfies Expediente), usuarioId]))
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

export async function marcarHomologado(chave: string, usuarioId: string): Promise<R> {
  try {
    await tx({ usuarioId }, async (db) => {
      const r = await db.query(`update configuracao set homologado = true, atualizado_em = now(), atualizado_por = $2 where chave = $1`, [chave, usuarioId])
      if (!r.rowCount) throw new ErroNegocio('Configuração não encontrada.')
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/* ------------------------------------------------------------------ */
/* Feriados                                                            */
/* ------------------------------------------------------------------ */

export const ABRANGENCIAS = [
  { valor: 'NACIONAL', rotulo: 'Nacional' },
  { valor: 'ESTADUAL', rotulo: 'Estadual' },
  { valor: 'MUNICIPAL', rotulo: 'Municipal' },
  { valor: 'EMPRESA', rotulo: 'Empresa' },
]

export const esquemaFeriado = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Data inválida.'),
  descricao: z.string().trim().min(3, 'Informe a descrição (mínimo 3 caracteres).').max(120, 'Descrição muito longa.'),
  abrangencia: z.enum(['NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'EMPRESA'], { message: 'Abrangência inválida.' }),
  unidadeId: z.string().transform((s) => (s.trim() === '' ? null : Number(s))).refine((n) => n === null || (Number.isInteger(n) && n > 0), 'Unidade inválida.'),
  meioPeriodo: z.boolean(),
}).refine((f) => !(f.abrangencia === 'MUNICIPAL' && f.unidadeId === null), { message: 'Feriado municipal exige a unidade.', path: ['unidadeId'] })

export async function listarFeriados(ano: number, db?: Db) {
  return q<{ id: number; data: string; descricao: string; abrangencia: string; unidade_id: number | null; unidade_nome: string | null; meio_periodo: boolean }>(
    `select f.id, f.data, f.descricao, f.abrangencia, f.unidade_id, un.nome as unidade_nome, f.meio_periodo
       from calendario_feriado f left join unidade un on un.id = f.unidade_id
      where extract(year from f.data) = $1 order by f.data`, [ano], db)
}

export async function salvarFeriado(id: number | null, entrada: Record<string, unknown>, usuarioId: string): Promise<R> {
  const v = esquemaFeriado.safeParse(entrada)
  if (!v.success) return { ok: false, erro: v.error.issues[0]?.message ?? 'Dados inválidos.' }
  const f = v.data
  try {
    await tx({ usuarioId }, async (db) => {
      if (f.unidadeId !== null) {
        const un = await q1('select 1 from unidade where id = $1 and ativo', [f.unidadeId], db)
        if (!un) throw new ErroNegocio('Unidade inexistente ou desativada.')
      }
      if (id === null) {
        await db.query(`insert into calendario_feriado (data, descricao, abrangencia, unidade_id, meio_periodo) values ($1,$2,$3,$4,$5)`,
          [f.data, f.descricao, f.abrangencia, f.unidadeId, f.meioPeriodo])
      } else {
        const r = await db.query(`update calendario_feriado set data=$2, descricao=$3, abrangencia=$4, unidade_id=$5, meio_periodo=$6 where id=$1`,
          [id, f.data, f.descricao, f.abrangencia, f.unidadeId, f.meioPeriodo])
        if (!r.rowCount) throw new ErroNegocio('Feriado não encontrado.')
      }
      // O calendário mudou: o expediente/calendário volta a depender de homologação
      await db.query(`update configuracao set homologado = false, atualizado_em = now(), atualizado_por = $1 where chave = 'calendario.expediente' and homologado`, [usuarioId])
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, { calendario_feriado_uk: 'Já existe um feriado nesta data para a mesma unidade.' }) }
  }
}

/** Remove um feriado cadastrado por engano (a exclusão fica registrada na trilha de auditoria). */
export async function excluirFeriado(id: number, usuarioId: string): Promise<R> {
  try {
    await tx({ usuarioId }, async (db) => {
      const r = await db.query('delete from calendario_feriado where id = $1', [id])
      if (!r.rowCount) throw new ErroNegocio('Feriado não encontrado.')
      await db.query(`update configuracao set homologado = false, atualizado_em = now(), atualizado_por = $1 where chave = 'calendario.expediente' and homologado`, [usuarioId])
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
