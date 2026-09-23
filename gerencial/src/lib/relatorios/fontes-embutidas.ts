/**
 * Fontes oficiais (Plus Jakarta Sans, Nunito, Playfair Display) embutidas no HTML dos PDFs como
 * data URIs (subconjuntos latin e latin-ext). Baixadas uma vez pelo servidor e guardadas em cache
 * (memória + arquivo temporário). Sem rede, os PDFs usam as fontes de reserva (Arial/Liberation).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { URL_FONTES_GOOGLE } from './estilo'

const ARQUIVO_CACHE = join(tmpdir(), 'costa-lavos-relatorio-fontes-v1.css')
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
let emMemoria: string | null = null
let falhouEm = 0

async function baixar(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r
  } finally {
    clearTimeout(t)
  }
}

/** CSS com @font-face embutidos, ou null quando indisponível. */
export async function cssFontesEmbutidas(): Promise<string | null> {
  if (emMemoria) return emMemoria
  try {
    const c = await readFile(ARQUIVO_CACHE, 'utf8')
    if (c.includes('@font-face')) return (emMemoria = c)
  } catch { /* sem cache em disco */ }
  if (Date.now() - falhouEm < 10 * 60_000) return null
  try {
    const css = await (await baixar(URL_FONTES_GOOGLE, 6000)).text()
    const blocos = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)].filter((m) => m[1] === 'latin' || m[1] === 'latin-ext').map((m) => m[2])
    const saida: string[] = []
    for (const b of blocos) {
      const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(b)?.[1]
      if (!url) continue
      const bin = Buffer.from(await (await baixar(url, 6000)).arrayBuffer())
      saida.push(b.replace(url, `data:font/woff2;base64,${bin.toString('base64')}`))
    }
    if (!saida.length) throw new Error('CSS de fontes sem blocos latin')
    emMemoria = saida.join('\n')
    await writeFile(ARQUIVO_CACHE, emMemoria).catch(() => {})
    return emMemoria
  } catch (e) {
    falhouEm = Date.now()
    console.warn('[relatorios] fontes oficiais indisponíveis; usando fontes de reserva:', (e as Error).message)
    return null
  }
}
