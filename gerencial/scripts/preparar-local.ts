/**
 * Prepara o ambiente de TESTE LOCAL em um passo: migrations, dados mínimos,
 * administrador e usuários de demonstração (um por perfil).
 * Uso: npm run preparar:local
 */
import { migrar } from './migrate'
import { seed } from './seed'
import { seedDemo, USUARIOS_DEMO, SENHA_DEMO } from './seed-demo'

;(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL no arquivo .env')
  process.env.APP_ENV = 'development'
  await migrar()
  await seed()
  await seedDemo()
  console.log('\nPronto. Rode "npm run dev" e abra http://localhost:3000')
  console.log(`Usuários de teste (senha ${SENHA_DEMO}):`)
  for (const u of USUARIOS_DEMO) console.log(`  ${u.email.padEnd(32)} ${u.nome.replace('[DEMO] ', '')}`)
})().catch((e) => {
  const codigo = e?.code ?? e?.errors?.[0]?.code
  if (codigo === 'ECONNREFUSED') {
    console.error('Falha ao preparar: não foi possível conectar ao PostgreSQL em localhost:5432.')
    console.error('Suba o banco (Docker Desktop aberto + "docker compose up -d") ou instale o PostgreSQL. Veja docs/teste-local.md.')
  } else if (codigo === '28P01') {
    console.error('Falha ao preparar: usuário ou senha do banco incorretos. Confira DATABASE_URL no arquivo .env.')
  } else if (codigo === '3D000') {
    console.error('Falha ao preparar: o banco informado em DATABASE_URL não existe. Crie o banco "gerencial" (veja docs/teste-local.md).')
  } else {
    console.error('Falha ao preparar:', e?.message || codigo || e)
  }
  process.exit(1)
})
