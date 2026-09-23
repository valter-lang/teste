import { test, expect, type Page } from '@playwright/test'

const SENHA = 'Demo12345678'
async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

test('login inválido mostra erro genérico', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('diretoria@demo.local')
  await page.getByLabel('Senha').fill('errada-123456')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos')
})

test('sem sessão, páginas redirecionam ao login e APIs respondem 401', async ({ page, request }) => {
  await page.goto('/fechamento')
  await expect(page).toHaveURL(/\/login/)
  const r = await request.get('/api/relatorios/1')
  expect(r.status()).toBe(401)
})

test('Diretoria: vê dashboard, abre "Ver cálculo" e não vê administração', async ({ page }) => {
  await entrar(page, 'diretoria@demo.local')
  await expect(page.getByRole('heading', { name: 'Dashboard executivo' })).toBeVisible()
  await expect(page.getByText('Comodato e manutenção')).toBeVisible()
  await page.getByRole('link', { name: 'Ver cálculo →' }).first().click()
  await expect(page.getByText('Memória de cálculo (reproduzível)')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Menu principal' })
  await expect(nav.getByRole('link', { name: 'Cadastros' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Configurações e usuários' })).toHaveCount(0)
})

test('Diretoria: fechamento mostra ação de aprovar apenas em validação (não pode iniciar preenchimento)', async ({ page }) => {
  await entrar(page, 'diretoria@demo.local')
  await page.goto('/fechamento?competencia=2026-08-01')
  await expect(page.getByRole('button', { name: 'Iniciar preenchimento' })).toHaveCount(0)
})

test('Lançador da oficina: acessa a própria área, sem acesso a TI nem à auditoria', async ({ page }) => {
  await entrar(page, 'lancador.oficina@demo.local')
  const nav = page.getByRole('navigation', { name: 'Menu principal' })
  await expect(nav.getByRole('link', { name: 'Manutenção interna' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Tecnologia da Informação' })).toHaveCount(0)
  const r = await page.goto('/ti')
  expect(r?.status()).not.toBe(200)
  const a = await page.goto('/auditoria')
  expect(a?.status()).not.toBe(200)
})

test('Gestor de TI: vê painel de TI e declarações do fechamento', async ({ page }) => {
  await entrar(page, 'gestor.ti@demo.local')
  await page.goto('/ti?competencia=2026-08-01')
  await expect(page.getByRole('heading', { name: 'Tecnologia da Informação' })).toBeVisible()
  await page.goto('/fechamento?competencia=2026-09-01')
  await expect(page.getByRole('button', { name: 'Declarar: não houve incidente P1' })).toBeVisible()
})

test('Auditor: lê trilha de auditoria e não cria planos de ação', async ({ page }) => {
  await entrar(page, 'auditor@demo.local')
  const r = await page.goto('/auditoria')
  expect(r?.status()).toBe(200)
  await page.goto('/planos-acao')
  await expect(page.getByRole('link', { name: 'Novo plano' })).toHaveCount(0)
})

test('Gestor de manutenção: plano de ação rejeita ação vaga', async ({ page }) => {
  await entrar(page, 'gestor.manutencao@demo.local')
  await page.goto('/planos-acao/novo?area=MANUT_EXTERNA&indicador=ME_DESNECESSARIOS&competencia=2026-07-01')
  await page.getByLabel('Causa raiz').fill('Clientes abrem chamados sem checagem prévia')
  await page.getByLabel('Ação objetiva').fill('Acompanhar os chamados')
  await page.getByLabel('Entregável').fill('ok')
  await page.getByLabel('Responsável nominal').fill('Gestor Demo')
  await page.getByLabel('Prazo').fill('2026-12-31')
  await page.getByLabel('Resultado esperado').fill('Taxa abaixo de 5%')
  await page.getByRole('button', { name: 'Criar plano de ação' }).click()
  await expect(page.getByText(/Ação vaga|entregável/).first()).toBeVisible()
})
