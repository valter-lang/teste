/**
 * Impressão dos PDFs com Chromium (playwright-core).
 *  - A4: duas passagens — a primeira mede quantas páginas cada seção ocupa (cada seção começa
 *    em página nova), a segunda imprime com o sumário numerado. Cabeçalho/rodapé em todas as
 *    páginas via headerTemplate/footerTemplate (período, versão, confidencialidade, página x/y).
 *  - 16:9: 1280×720 px por página, mesma estrutura do PowerPoint.
 * Fontes oficiais embutidas (fontes-embutidas.ts); a página não acessa nada além das fontes do Google.
 */
import { chromium, type Browser, type Page } from 'playwright-core'
import { htmlApresentacao, htmlRelatorioA4, moldurasA4, secoesA4 } from './html'
import type { DadosRelatorio } from './tipos'
import { cssFontesEmbutidas } from './fontes-embutidas'

const fontesDe = (d: DadosRelatorio) => (d.metadados.fonteExportacao === 'OFICIAL' ? cssFontesEmbutidas() : Promise.resolve(null))

export const CAMINHO_CHROMIUM_PADRAO = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export async function abrirNavegador(): Promise<Browser> {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || CAMINHO_CHROMIUM_PADRAO,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })
}

async function comPagina<T>(fn: (p: Page) => Promise<T>, navegador?: Browser): Promise<T> {
  const b = navegador ?? (await abrirNavegador())
  try {
    const ctx = await b.newContext({ javaScriptEnabled: true, offline: false })
    const page = await ctx.newPage()
    await page.route('**/*', (r) => {
      const u = r.request().url()
      if (u.startsWith('https://fonts.googleapis.com/') || u.startsWith('https://fonts.gstatic.com/')) return r.continue()
      return r.abort()
    })
    try {
      return await fn(page)
    } finally {
      await ctx.close()
    }
  } finally {
    if (!navegador) await b.close()
  }
}

async function carregar(page: Page, html: string) {
  await page.setContent(html, { waitUntil: 'load', timeout: 30_000 })
  // Fontes: espera no máximo 6 s; sem rede, usa as fontes de reserva.
  await page.evaluate(() => Promise.race([document.fonts.ready.then(() => true), new Promise((r) => setTimeout(r, 6000))])).catch(() => {})
}

/** Conta páginas de um PDF gerado pelo Chromium. */
export function contarPaginas(pdf: Buffer): number {
  const m = pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)
  return m ? m.length : 0
}

export async function gerarPdfA4(d: DadosRelatorio, navegador?: Browser): Promise<Buffer> {
  const mold = moldurasA4(d)
  const opcoes = {
    format: 'A4' as const, printBackground: true, displayHeaderFooter: true, headerTemplate: mold.header, footerTemplate: mold.footer,
    margin: { top: '24mm', bottom: '18mm', left: '14mm', right: '14mm' }, preferCSSPageSize: false,
  }
  const cssFontes = await fontesDe(d)
  return comPagina(async (page) => {
    // 1ª passagem: páginas por bloco (capa, sumário e cada seção)
    await carregar(page, htmlRelatorioA4(d, {}, cssFontes))
    const blocos = ['capa', 'sumario', ...secoesA4(d).map((s) => s.id)]
    const paginasPorBloco: Record<string, number> = {}
    for (const b of blocos) {
      await page.evaluate((alvo) => {
        document.querySelectorAll<HTMLElement>('[data-bloco]').forEach((el) => { el.style.display = el.dataset.bloco === alvo ? '' : 'none' })
      }, b)
      paginasPorBloco[b] = contarPaginas(await page.pdf(opcoes))
    }
    const inicio: Record<string, number> = {}
    let pagina = 1
    for (const b of blocos) { inicio[b] = pagina; pagina += paginasPorBloco[b] }
    // 2ª passagem: sumário com números de página
    await carregar(page, htmlRelatorioA4(d, inicio, cssFontes))
    return page.pdf(opcoes)
  }, navegador)
}

export async function gerarPdfApresentacao(d: DadosRelatorio, navegador?: Browser): Promise<Buffer> {
  const cssFontes = await fontesDe(d)
  return comPagina(async (page) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await carregar(page, htmlApresentacao(d, cssFontes))
    return page.pdf({ width: '1280px', height: '720px', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' }, preferCSSPageSize: true })
  }, navegador)
}
