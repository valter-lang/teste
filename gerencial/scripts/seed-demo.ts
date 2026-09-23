/**
 * Usuários de DEMONSTRAÇÃO, um por perfil — somente com APP_ENV=development.
 * Nunca executar em homologação/produção. Todos têm o sufixo @demo.local.
 */
import { Client } from 'pg'
import bcrypt from 'bcryptjs'

export const USUARIOS_DEMO: { nome: string; email: string; papeis: [string, string | null][] }[] = [
  { nome: '[DEMO] Administrador', email: 'admin@demo.local', papeis: [['ADMIN', null]] },
  { nome: '[DEMO] Diretoria', email: 'diretoria@demo.local', papeis: [['DIRETORIA', null]] },
  { nome: '[DEMO] Gestor TI', email: 'gestor.ti@demo.local', papeis: [['GESTOR', 'TI']] },
  { nome: '[DEMO] Gestor Manutenção', email: 'gestor.manutencao@demo.local', papeis: [['GESTOR', 'MANUT_INTERNA'], ['GESTOR', 'MANUT_EXTERNA'], ['GESTOR', 'ESTOQUE_PECAS'], ['GESTOR', 'COMODATO']] },
  { nome: '[DEMO] Lançador Oficina', email: 'lancador.oficina@demo.local', papeis: [['LANCADOR', 'MANUT_INTERNA']] },
  { nome: '[DEMO] Auditor', email: 'auditor@demo.local', papeis: [['AUDITOR', null]] },
]
export const SENHA_DEMO = 'Demo12345678'

export async function seedDemo(databaseUrl = process.env.DATABASE_URL, log = console.log) {
  if (process.env.APP_ENV !== 'development') throw new Error('Dados de demonstração só podem ser carregados com APP_ENV=development.')
  const c = new Client({ connectionString: databaseUrl })
  await c.connect()
  try {
    const h = await bcrypt.hash(SENHA_DEMO, 10)
    for (const u of USUARIOS_DEMO) {
      const r = await c.query(`insert into usuario (nome, email, senha_hash, deve_trocar_senha) values ($1,$2,$3,false)
        on conflict (lower(email)) do update set nome = excluded.nome, senha_hash = excluded.senha_hash, ativo = true, tentativas_falhas = 0, bloqueado_ate = null returning id`, [u.nome, u.email, h])
      await c.query('delete from usuario_papel where usuario_id = $1', [r.rows[0].id])
      for (const [p, a] of u.papeis) await c.query('insert into usuario_papel (usuario_id, papel, area_codigo) values ($1,$2,$3)', [r.rows[0].id, p, a])
    }
    log(`${USUARIOS_DEMO.length} usuários de demonstração prontos (senha ${SENHA_DEMO}).`)
  } finally {
    await c.end()
  }
}

if (require.main === module) {
  seedDemo().catch((e) => { console.error(e.message); process.exit(1) })
}
