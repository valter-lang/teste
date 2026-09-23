/**
 * Gráficos SVG inline (sem dependências) para o PDF A4 e o PDF 16:9.
 * Todo texto é escapado. Nunca usa cor como única informação: valores sempre rotulados.
 */
import { COR, cor } from './estilo'
import { esc } from './nomes'

export interface SerieSvg { nome: string; valores: (number | null)[]; cor: string }

export interface OpcoesColunas {
  categorias: string[]
  series: SerieSvg[]
  /** cores por categoria (somente com uma série): destaca o período atual */
  coresPorPonto?: string[]
  meta?: { valor: number; rotulo: string } | null
  largura: number
  altura: number
  formatar: (v: number) => string
  fonte?: string
  legenda?: boolean
  tamanhoTexto?: number
}

function escala(max: number, min: number, inteiro = false) {
  const faixa = max - min || Math.abs(max) || 1
  const passo0 = inteiro ? Math.max(1, faixa / 4) : faixa / 4
  const mag = 10 ** Math.floor(Math.log10(passo0))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= passo0) ?? passo0
  const topo = Math.ceil(max / passo) * passo
  const base = Math.min(0, Math.floor(min / passo) * passo)
  const ticks: number[] = []
  for (let v = base; v <= topo + passo / 2; v += passo) ticks.push(Number(v.toFixed(10)))
  return { topo: topo === base ? base + passo : topo, base, ticks }
}

const abreviar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Colunas agrupadas (ou simples) com linha de meta opcional em dourado. */
export function svgColunas(o: OpcoesColunas): string {
  const fs = o.tamanhoTexto ?? 11
  const ff = o.fonte ?? 'sans-serif'
  const legendaH = o.legenda && o.series.length > 1 ? fs * 2 : 0
  const pad = { t: fs * 1.8, r: 10, b: fs * 2.6 + legendaH, l: fs * 3.6 }
  const todos = o.series.flatMap((s) => s.valores).filter((v): v is number => v !== null)
  if (o.meta) todos.push(o.meta.valor)
  const max = Math.max(0, ...todos)
  const min = Math.min(0, ...todos)
  const { topo, base, ticks } = escala(max, min, todos.every((v) => Number.isInteger(v)))
  pad.l = Math.max(fs * 2.4, ...ticks.map((t) => o.formatar(t).length * fs * 0.5 + 10))
  const w = o.largura - pad.l - pad.r
  const h = o.altura - pad.t - pad.b
  const y = (v: number) => pad.t + h - ((v - base) / (topo - base)) * h
  const nCat = Math.max(1, o.categorias.length)
  const grupoW = w / nCat
  const nSer = o.series.length
  const barW = Math.min(46, (grupoW * 0.72) / nSer)
  const partes: string[] = []
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.largura}" height="${o.altura}" viewBox="0 0 ${o.largura} ${o.altura}" font-family="${esc(ff)}" role="img">`)
  for (const t of ticks) {
    partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${cor(COR.pedraClara)}" stroke-width="1"/>`)
    partes.push(`<text x="${pad.l - 6}" y="${(y(t) + fs * 0.35).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.neutro)}" text-anchor="end">${esc(o.formatar(t))}</text>`)
  }
  o.categorias.forEach((c, i) => {
    const x0 = pad.l + i * grupoW + (grupoW - barW * nSer) / 2
    o.series.forEach((s, k) => {
      const v = s.valores[i]
      const x = x0 + k * barW
      if (v === null || v === undefined) {
        partes.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${(y(0) - 4).toFixed(1)}" font-size="${fs * 0.75}" fill="${cor(COR.neutro)}" text-anchor="middle">n/i</text>`)
        return
      }
      const fill = nSer === 1 && o.coresPorPonto ? o.coresPorPonto[i] : s.cor
      const yv = y(Math.max(v, 0))
      const hv = Math.abs(y(v) - y(0))
      partes.push(`<rect x="${(x + 1).toFixed(1)}" y="${yv.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${Math.max(hv, 0.5).toFixed(1)}" rx="2" fill="${cor(fill)}"/>`)
      partes.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${(v >= 0 ? yv - 4 : y(v) + fs).toFixed(1)}" font-size="${fs * (nSer > 2 ? 0.72 : 0.85)}" font-weight="700" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(o.formatar(v))}</text>`)
    })
    const lx = pad.l + i * grupoW + grupoW / 2
    partes.push(`<text x="${lx.toFixed(1)}" y="${(pad.t + h + fs * 1.3).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(abreviar(c, Math.max(6, Math.floor(grupoW / (fs * 0.5)))))}</text>`)
  })
  partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${cor(COR.pedra)}" stroke-width="1.2"/>`)
  if (o.meta) {
    const ym = y(o.meta.valor).toFixed(1)
    partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${ym}" y2="${ym}" stroke="${cor(COR.dourado)}" stroke-width="2.2" stroke-dasharray="6 4"/>`)
    partes.push(`<text x="${pad.l + w}" y="${(Number(ym) - 5).toFixed(1)}" font-size="${fs * 0.8}" font-weight="700" fill="${cor(COR.douradoEscuro)}" text-anchor="end">${esc(o.meta.rotulo)}</text>`)
  }
  if (legendaH) {
    let lx = pad.l
    const ly = o.altura - fs * 0.8
    for (const s of o.series) {
      partes.push(`<rect x="${lx}" y="${ly - fs * 0.75}" width="${fs * 0.8}" height="${fs * 0.8}" rx="2" fill="${cor(s.cor)}"/>`)
      partes.push(`<text x="${lx + fs * 1.1}" y="${ly}" font-size="${fs * 0.85}" fill="${cor(COR.tinta)}">${esc(s.nome)}</text>`)
      lx += fs * 1.6 + s.nome.length * fs * 0.55
    }
  }
  partes.push('</svg>')
  return partes.join('')
}

/** Ranking em barras horizontais (estilo "destaques do mês"). */
export function svgRanking(o: { itens: { rotulo: string; valor: number; texto: string }[]; largura: number; alturaLinha?: number; fonte?: string; tamanhoTexto?: number; corBarra?: string }): string {
  const fs = o.tamanhoTexto ?? 11
  const lh = o.alturaLinha ?? fs * 3
  const altura = Math.max(lh, o.itens.length * lh)
  const max = Math.max(1, ...o.itens.map((i) => i.valor))
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.largura}" height="${altura}" viewBox="0 0 ${o.largura} ${altura}" font-family="${esc(o.fonte ?? 'sans-serif')}" role="img">`]
  o.itens.forEach((it, k) => {
    const y0 = k * lh
    partes.push(`<text x="0" y="${(y0 + fs).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.tinta)}">${esc(abreviar(it.rotulo, 34))}</text>`)
    partes.push(`<text x="${o.largura}" y="${(y0 + fs).toFixed(1)}" font-size="${fs}" font-weight="800" fill="${cor(COR.vermelho)}" text-anchor="end">${esc(it.texto)}</text>`)
    partes.push(`<rect x="0" y="${(y0 + fs * 1.45).toFixed(1)}" width="${o.largura}" height="${(fs * 0.7).toFixed(1)}" rx="${fs * 0.35}" fill="${cor('EFE6D6')}"/>`)
    partes.push(`<rect x="0" y="${(y0 + fs * 1.45).toFixed(1)}" width="${Math.max(2, (it.valor / max) * o.largura).toFixed(1)}" height="${(fs * 0.7).toFixed(1)}" rx="${fs * 0.35}" fill="${cor(o.corBarra ?? 'C9A45C')}"/>`)
  })
  partes.push('</svg>')
  return partes.join('')
}

/** Pareto: colunas do mês + linha do acumulado (%) + referência de 80%. */
export function svgPareto(o: { itens: { rotulo: string; valor: number; acumulado: number; classeA: boolean }[]; largura: number; altura: number; formatar: (v: number) => string; fonte?: string; tamanhoTexto?: number }): string {
  const fs = o.tamanhoTexto ?? 11
  const pad = { t: fs * 1.8, r: fs * 3, b: fs * 2.6, l: fs * 3.2 }
  const w = o.largura - pad.l - pad.r
  const h = o.altura - pad.t - pad.b
  const max = Math.max(1, ...o.itens.map((i) => i.valor))
  const { topo, ticks } = escala(max, 0)
  const y = (v: number) => pad.t + h - (v / topo) * h
  const yp = (p: number) => pad.t + h - (p / 100) * h
  const n = Math.max(1, o.itens.length)
  const gw = w / n
  const bw = Math.min(46, gw * 0.7)
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.largura}" height="${o.altura}" viewBox="0 0 ${o.largura} ${o.altura}" font-family="${esc(o.fonte ?? 'sans-serif')}" role="img">`]
  for (const t of ticks) {
    partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${cor(COR.pedraClara)}"/>`)
    partes.push(`<text x="${pad.l - 6}" y="${(y(t) + fs * 0.35).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.neutro)}" text-anchor="end">${esc(o.formatar(t))}</text>`)
  }
  partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${yp(80).toFixed(1)}" y2="${yp(80).toFixed(1)}" stroke="${cor(COR.dourado)}" stroke-width="2" stroke-dasharray="6 4"/>`)
  partes.push(`<text x="${pad.l + w + 4}" y="${(yp(80) + fs * 0.35).toFixed(1)}" font-size="${fs * 0.8}" fill="${cor(COR.douradoEscuro)}" font-weight="700">80%</text>`)
  const pts: string[] = []
  o.itens.forEach((it, i) => {
    const x = pad.l + i * gw + (gw - bw) / 2
    partes.push(`<rect x="${x.toFixed(1)}" y="${y(it.valor).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pad.t + h - y(it.valor)).toFixed(1)}" rx="2" fill="${cor(it.classeA ? COR.vinho : COR.pedra)}"/>`)
    partes.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(y(it.valor) - 4).toFixed(1)}" font-size="${fs * 0.8}" font-weight="700" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(o.formatar(it.valor))}</text>`)
    partes.push(`<text x="${(pad.l + i * gw + gw / 2).toFixed(1)}" y="${(pad.t + h + fs * 1.3).toFixed(1)}" font-size="${fs * 0.8}" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(abreviar(it.rotulo, Math.max(6, Math.floor(gw / (fs * 0.5)))))}</text>`)
    pts.push(`${(pad.l + i * gw + gw / 2).toFixed(1)},${yp(it.acumulado).toFixed(1)}`)
  })
  partes.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${cor(COR.vermelho)}" stroke-width="2"/>`)
  o.itens.forEach((it, i) => partes.push(`<circle cx="${(pad.l + i * gw + gw / 2).toFixed(1)}" cy="${yp(it.acumulado).toFixed(1)}" r="3" fill="${cor(COR.vermelho)}"/>`))
  partes.push('</svg>')
  return partes.join('')
}

/** Linha simples (evolução) com meta opcional. */
export function svgLinha(o: { categorias: string[]; valores: (number | null)[]; meta?: { valor: number; rotulo: string } | null; largura: number; altura: number; formatar: (v: number) => string; fonte?: string; tamanhoTexto?: number }): string {
  const fs = o.tamanhoTexto ?? 11
  const pad = { t: fs * 1.8, r: 12, b: fs * 2.4, l: fs * 3.6 }
  const w = o.largura - pad.l - pad.r
  const h = o.altura - pad.t - pad.b
  const vals = o.valores.filter((v): v is number => v !== null)
  if (o.meta) vals.push(o.meta.valor)
  const { topo, base, ticks } = escala(Math.max(0, ...vals), Math.min(0, ...vals))
  const y = (v: number) => pad.t + h - ((v - base) / (topo - base)) * h
  const n = Math.max(1, o.categorias.length)
  const x = (i: number) => pad.l + (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.largura}" height="${o.altura}" viewBox="0 0 ${o.largura} ${o.altura}" font-family="${esc(o.fonte ?? 'sans-serif')}" role="img">`]
  for (const t of ticks) {
    partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${cor(COR.pedraClara)}"/>`)
    partes.push(`<text x="${pad.l - 6}" y="${(y(t) + fs * 0.35).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.neutro)}" text-anchor="end">${esc(o.formatar(t))}</text>`)
  }
  if (o.meta) {
    partes.push(`<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(o.meta.valor).toFixed(1)}" y2="${y(o.meta.valor).toFixed(1)}" stroke="${cor(COR.dourado)}" stroke-width="2.2" stroke-dasharray="6 4"/>`)
  }
  let seg: string[] = []
  const flush = () => { if (seg.length > 1) partes.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${cor(COR.vinho)}" stroke-width="2.4"/>`); seg = [] }
  o.valores.forEach((v, i) => { if (v === null) flush(); else seg.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`) })
  flush()
  o.valores.forEach((v, i) => {
    if (v !== null) {
      const ult = i === o.valores.length - 1
      partes.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${ult ? 4.5 : 3}" fill="${cor(ult ? COR.vermelho : COR.vinho)}"/>`)
      partes.push(`<text x="${x(i).toFixed(1)}" y="${(y(v) - 7).toFixed(1)}" font-size="${fs * 0.8}" font-weight="700" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(o.formatar(v))}</text>`)
    }
    partes.push(`<text x="${x(i).toFixed(1)}" y="${(pad.t + h + fs * 1.3).toFixed(1)}" font-size="${fs * 0.85}" fill="${cor(COR.tinta)}" text-anchor="middle">${esc(o.categorias[i])}</text>`)
  })
  partes.push('</svg>')
  return partes.join('')
}
