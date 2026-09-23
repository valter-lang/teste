import { defineConfig } from '@playwright/test'

const PORTA = Number(process.env.E2E_PORTA ?? 3300)
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORTA}`,
    port: PORTA,
    timeout: 600_000,
    reuseExistingServer: true,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://gerencial:gerencial@localhost:5432/gerencial_e2e',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-segredo-e2e-segredo-e2e-segredo-e2e',
      APP_ENV: 'development',
      NODE_ENV: 'production',
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
