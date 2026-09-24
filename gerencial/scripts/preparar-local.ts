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
  console.error('Falha ao preparar:', e.message)
  process.exit(1)
})
