/**
 * Executor de migrations SQL (db/migrations/NNN_*.sql), em ordem, cada uma em transação.
 * Registra o que já foi aplicado em schema_migracao com hash para detectar alteração indevida.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { Client } from 'pg'

export async function migrar(databaseUrl = process.env.DATABASE_URL, log = console.log) {
  if (!databaseUrl) throw new Error('DATABASE_URL não definida')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`create table if not exists schema_migracao (
      arquivo text primary key, hash text not null, aplicado_em timestamptz not null default now())`)
    const dir = path.join(__dirname, '..', 'db', 'migrations')
    const arquivos = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
    const { rows } = await client.query<{ arquivo: string; hash: string }>('select arquivo, hash from schema_migracao')
    const aplicadas = new Map(rows.map((r) => [r.arquivo, r.hash]))
    for (const arquivo of arquivos) {
      const sql = readFileSync(path.join(dir, arquivo), 'utf8')
      const hash = createHash('sha256').update(sql).digest('hex')
      const anterior = aplicadas.get(arquivo)
      if (anterior) {
        if (anterior !== hash) throw new Error(`Migration ${arquivo} foi alterada após ser aplicada. Crie uma nova migration.`)
        continue
      }
      log(`Aplicando ${arquivo}...`)
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migracao (arquivo, hash) values ($1, $2)', [arquivo, hash])
        await client.query('commit')
      } catch (e) {
        await client.query('rollback')
        throw new Error(`Falha em ${arquivo}: ${(e as Error).message}`)
      }
    }
    log('Migrations em dia.')
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  migrar().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
