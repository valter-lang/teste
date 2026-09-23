/**
 * Apresentação EDITÁVEL (pptxgenjs, LAYOUT_WIDE 13,333 × 7,5 in): caixas de texto reais,
 * tabelas nativas (addTable) e gráficos nativos com dados embutidos (addChart). Nenhuma imagem
 * de gráfico/tela é usada.
 */
import PptxGenJS from 'pptxgenjs'
import { COR, fontes } from './estilo'
import { montarDeck } from './estrutura'
import { diagramar, type El, type FormatoNum, type Grafico } from './layout'
import type { DadosRelatorio } from './tipos'

type Pres = InstanceType<typeof PptxGenJS>
type SlideP = ReturnType<Pres['addSlide']>

/** Formato numérico do Excel/PowerPoint (o separador é localizado pelo aplicativo). */
function codigoFormato(f: FormatoNum, ocultarZero = false): string {
  const base = f.moeda ? '"R$" #,##0' : f.casas > 0 ? `#,##0.${'0'.repeat(f.casas)}` : '#,##0'
  const s = f.sufixo === '%' ? `${base}"%"` : base
  return ocultarZero ? `${s};-${s};;` : s
}

function grafico(pres: Pres, slide: SlideP, el: Extract<El, { k: 'graf' }>, fonte: string) {
  let g: Grafico = el.g
  const comum = {
    x: el.x, y: el.y, w: el.w, h: el.h, altText: g.titulo, objectName: g.titulo.slice(0, 60),
    catAxisLabelFontFace: fonte, catAxisLabelFontSize: 9, catAxisLabelColor: COR.tinta,
    valAxisLabelFontFace: fonte, valAxisLabelFontSize: 8, valAxisLabelColor: COR.neutro,
    valGridLine: { color: 'E4E0DC', size: 0.75 }, catAxisLineShow: true, catAxisLineColor: COR.pedra,
    valAxisLineShow: false, dataLabelFontFace: fonte, dataLabelFontSize: 8, dataLabelColor: COR.tinta, dataLabelFontBold: true,
    legendFontFace: fonte, legendFontSize: 9, legendColor: COR.tinta,
  }
  if (g.t === 'colunas') {
    const fmt = codigoFormato(g.formato, g.destacarUltimo)
    let dataBar: { name: string; labels: string[]; values: number[] }[]
    let cores: string[]
    if (g.destacarUltimo && g.series.length === 1) {
      const v = g.series[0].valores
      const ult = v.length - 1
      // Mês sem dado: rótulo explícito (o valor 0 do gráfico fica oculto pelo formato).
      g = { ...g, categorias: g.categorias.map((c, i) => (v[i] === null ? `${c} (n/i)` : c)) }
      dataBar = [
        { name: 'Meses anteriores', labels: g.categorias, values: v.map((x, i) => (i === ult ? 0 : x ?? 0)) },
        { name: 'Mês de referência', labels: g.categorias, values: v.map((x, i) => (i === ult ? x ?? 0 : 0)) },
      ]
      cores = [COR.pedra, COR.vermelho]
    } else {
      dataBar = g.series.map((s) => ({ name: s.nome, labels: g.categorias, values: s.valores.map((x) => x ?? 0) }))
      cores = g.series.map((s) => s.cor)
    }
    const barOpts = {
      barDir: 'col', barGrouping: g.destacarUltimo ? 'stacked' : 'clustered', barGapWidthPct: g.destacarUltimo ? 70 : 60,
      ...(g.destacarUltimo ? { barOverlapPct: 100 } : {}),
      chartColors: cores, showValue: true, dataLabelFormatCode: fmt, dataLabelPosition: g.destacarUltimo ? 'inEnd' : 'outEnd',
    } as const
    const meta = g.meta
    const categorias = g.categorias
    if (meta) {
      const tipos = [
        { type: pres.ChartType.bar, data: dataBar, options: barOpts },
        { type: pres.ChartType.line, data: [{ name: meta.rotulo, labels: categorias, values: categorias.map(() => meta.valor) }],
          options: { chartColors: [COR.dourado], lineSize: 2, lineDataSymbol: 'none', lineDash: 'dash', showValue: false } },
      ]
      slide.addChart(tipos as never, { ...comum, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: codigoFormato(g.formato), valAxisMinVal: 0 } as never)
    } else {
      slide.addChart(pres.ChartType.bar, dataBar, { ...comum, ...barOpts, showLegend: g.legenda || g.destacarUltimo, legendPos: 'b', valAxisLabelFormatCode: codigoFormato(g.formato), valAxisMinVal: 0 } as never)
    }
    return
  }
  // Pareto: colunas + acumulado (%) no eixo secundário
  const tipos = [
    { type: pres.ChartType.bar, data: [{ name: 'Mês de referência', labels: g.categorias, values: g.valores }],
      options: { chartColors: [COR.vinho], barGapWidthPct: 60, showValue: true, dataLabelFormatCode: codigoFormato(g.formato), dataLabelPosition: 'outEnd' } },
    { type: pres.ChartType.line, data: [{ name: 'Acumulado (%)', labels: g.categorias, values: g.acumulado }],
      options: { chartColors: [COR.vermelho], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 6, secondaryValAxis: true, secondaryCatAxis: true, showValue: false } },
  ]
  slide.addChart(tipos as never, {
    ...comum, showLegend: true, legendPos: 'b',
    valAxes: [{ showValAxisTitle: false, valAxisMinVal: 0, valAxisLabelFormatCode: codigoFormato(g.formato) }, { showValAxisTitle: false, valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelFormatCode: '0"%"', valGridLine: { style: 'none' } }],
    catAxes: [{ catAxisTitle: '' }, { catAxisHidden: true }],
  } as never)
}

function desenhar(pres: Pres, slide: SlideP, el: El, f: ReturnType<typeof fontes>) {
  const face = (k?: string) => (k === 'titulo' ? f.titulo : k === 'capa' ? f.capa : f.corpo)
  switch (el.k) {
    case 'ret':
      slide.addShape(el.raio ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
        x: el.x, y: el.y, w: el.w, h: el.h, fill: el.fill ? { color: el.fill } : { type: 'none' } as never,
        line: el.linha ? { color: el.linha, width: 0.75 } : { type: 'none' } as never, ...(el.raio ? { rectRadius: el.raio } : {}),
      })
      return
    case 'txt': {
      const runs = el.runs.map((r, i) => ({
        text: r.texto,
        options: {
          bold: r.negrito ?? el.negrito, italic: r.italico ?? el.italico, color: r.cor ?? el.cor, fontSize: r.tam ?? el.tam,
          ...(r.quebra && i < el.runs.length - 1 ? { breakLine: true } : {}),
          ...((r.link ?? el.link) ? { hyperlink: { slide: (r.link ?? el.link)!, tooltip: 'Ir para o slide relacionado' } } : {}),
        },
      }))
      slide.addText(runs, {
        x: el.x, y: el.y, w: el.w, h: el.h, fontFace: face(el.fonte), fontSize: el.tam, color: el.cor,
        align: el.alinhar === 'c' ? 'center' : el.alinhar === 'r' ? 'right' : 'left',
        valign: el.valign === 'm' ? 'middle' : el.valign === 'b' ? 'bottom' : 'top',
        margin: el.fill ? [0, 4, 0, 4] : 0, lineSpacingMultiple: 0.98, paraSpaceBefore: 0, paraSpaceAfter: 0,
        ...(el.fill ? { fill: { color: el.fill }, shape: el.raio ? pres.ShapeType.roundRect : pres.ShapeType.rect, ...(el.raio ? { rectRadius: el.raio } : {}) } : {}),
      })
      return
    }
    case 'tab': {
      const al = (a: string) => (a === 'direita' ? 'right' : a === 'centro' ? 'center' : 'left') as 'left' | 'right' | 'center'
      const cab = el.cab.map((c, i) => ({ text: c, options: { bold: true, color: COR.branco, fill: { color: COR.vinho }, align: al(el.alinhamento[i]), fontFace: f.titulo, fontSize: el.tam } }))
      const linhas = el.linhas.map((l, r) => l.map((c, i) => ({
        text: c.texto,
        options: {
          color: c.cor ?? COR.tinta, bold: c.negrito ?? false, align: al(el.alinhamento[i]), fontFace: f.corpo, fontSize: el.tam,
          fill: { color: c.fill ?? (r % 2 ? 'FAF7F4' : COR.branco) },
        },
      })))
      slide.addTable([cab, ...linhas], {
        x: el.x, y: el.y, w: el.w, colW: el.colW, rowH: el.alturaLinha, valign: 'middle', autoPage: false,
        border: { type: 'solid', pt: 0.5, color: 'E4E0DC' }, margin: [0.03, 0.07, 0.03, 0.07],
      })
      return
    }
    case 'graf':
      grafico(pres, slide, el, f.corpo)
      return
    case 'img':
      slide.addImage({ data: `data:${el.mime};base64,${el.base64}`, x: el.x, y: el.y, w: el.w, h: el.h, sizing: { type: 'contain', w: el.w, h: el.h }, altText: 'Costa Lavos' })
      return
  }
}

export async function gerarPptx(d: DadosRelatorio): Promise<Buffer> {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_WIDE'
  pres.author = 'Costa Lavos'
  pres.company = 'Costa Lavos'
  pres.title = `Apresentação da Diretoria — ${d.metadados.competenciaRotulo}`
  pres.subject = `Relatório Executivo • ${d.metadados.escopoRotulo} • ${d.metadados.modoRotulo}`
  const f = fontes(d.metadados.fonteExportacao)
  pres.theme = { headFontFace: f.titulo, bodyFontFace: f.corpo }
  const deck = montarDeck(d)
  for (const s of diagramar(d, deck)) {
    const slide = pres.addSlide()
    slide.background = { color: s.fundo }
    for (const el of s.els) desenhar(pres, slide, el, f)
  }
  const out = await pres.write({ outputType: 'nodebuffer' })
  return out as Buffer
}
