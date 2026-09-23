import { Pool, type PoolClient, type QueryResultRow } from 'pg'

// Datas (date) chegam como string 'YYYY-MM-DD' para evitar deslocamento de fuso.
import pg from 'pg'
pg.types.setTypeParser(1082, (v: string) => v)
// numeric -> number (valores do domínio cabem com folga em double)
pg.types.setTypeParser(1700, (v: string) => (v === null ? null : Number(v)))
pg.types.setTypeParser(20, (v: string) => Number(v))

const globalForPool = globalThis as unknown as { __clPool?: Pool }

export function pool(): Pool {
  if (!globalForPool.__clPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL não configurada')
    globalForPool.__clPool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) })
  }
  return globalForPool.__clPool
}

export type Db = Pick<PoolClient, 'query'>

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()) {
  const r = await db.query<T>(sql, params)
  return r.rows
}

export async function q1<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()) {
  const r = await db.query<T>(sql, params)
  return r.rows[0] as T | undefined
}

export interface ContextoTx {
  usuarioId?: string | null
  contexto?: Record<string, unknown>
  /** Somente para rotinas controladas (reabertura/migração). Nunca exposto a formulários. */
  ignorarBloqueio?: boolean
}

/**
 * Executa uma transação informando o usuário responsável para a trilha de auditoria
 * (lida pelos triggers via current_setting('app.usuario_id')).
 */
export async function tx<T>(ctx: ContextoTx, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('begin')
    if (ctx.usuarioId) await client.query(`select set_config('app.usuario_id', $1, true)`, [ctx.usuarioId])
    if (ctx.contexto) await client.query(`select set_config('app.contexto', $1, true)`, [JSON.stringify(ctx.contexto)])
    if (ctx.ignorarBloqueio) await client.query(`select set_config('app.ignorar_bloqueio', 'on', true)`)
    const r = await fn(client)
    await client.query('commit')
    return r
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Traduz erros do banco em mensagens de negócio legíveis. */
export function mensagemErroDb(e: unknown): string {
  const err = e as { code?: string; message?: string; hint?: string; constraint?: string; detail?: string }
  if (err?.hint === 'PERIODO_BLOQUEADO' || err?.hint?.startsWith('META_') || err?.hint === 'LIMITE_ANALISE') return err.message!
  if (err?.code === '23505') return 'Registro duplicado: já existe um lançamento com a mesma chave de negócio.'
  if (err?.code === '23514') return `Dados inconsistentes (regra ${err.constraint ?? 'de validação'}). Revise os campos obrigatórios e datas.`
  if (err?.code === '23503') return 'Referência inválida: cadastro inexistente ou removido.'
  if (err?.code === 'P0001') return err.message ?? 'Operação não permitida.'
  return 'Erro inesperado ao gravar. A equipe de sistemas foi notificada.'
}
