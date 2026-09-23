/**
 * Diagramação dos slides em primitivas posicionadas (polegadas). O PowerPoint (pptx.ts) e o
 * PDF 16:9 (html.ts) desenham as MESMAS primitivas: caixas de texto, retângulos, tabelas e
 * gráficos (nativos no PowerPoint, SVG no PDF).
 */
import { COR, STATUS_REL } from './estilo'
import { G, montarDeck, type Deck, type Slide, type Tom } from './estrutura'
import type { DadosRelatorio, IndicadorRelatorio, Quebra } from './tipos'
import { numero } from '@/lib/format'

export type FonteEl = 'corpo' | 'titulo' | 'capa'
export interface Run { texto: string; negrito?: boolean; cor?: string; tam?: number; italico?: boolean; quebra?: boolean; link?: number }

export type El =
  | { k: 'ret'; x: number; y: number; w: number; h: number; fill?: string; linha?: string; raio?: number }
  | { k: 'txt'; x: number; y: number; w: number; h: number; runs: Run[]; tam: number; cor: string; fonte?: FonteEl; negrito?: boolean; alinhar?: 'l' | 'c' | 'r'; valign?: 't' | 'm' | 'b'; fill?: string; raio?: number; italico?: boolean; link?: number }
  | { k: 'tab'; x: number; y: number; w: number; colW: number[]; cab: string[]; linhas: { texto: string; cor?: string; negrito?: boolean; fill?: string }[][]; tam: number; alinhamento: ('esquerda' | 'direita' | 'centro')[]; alturaLinha: number }
  | { k: 'graf'; x: number; y: number; w: number; h: number; g: Grafico }
  | { k: 'img'; x: number; y: number; w: number; h: number; mime: string; base64: string }

export interface FormatoNum { casas: number; sufixo: '' | '%'; moeda: boolean }

export type Grafico =
  | { t: 'colunas'; categorias: string[]; series: { nome: string; valores: (number | null)[]; cor: string }[]; destacarUltimo: boolean; meta: { valor: number; rotulo: string } | null; formato: FormatoNum; legenda: boolean; titulo: string }
  | { t: 'pareto'; categorias: string[]; valores: number[]; acumulado: number[]; classeA: boolean[]; formato: FormatoNum; titulo: string }

export interface SlidePosicionado { els: El[]; titulo: string; fundo: string }

/* ------------------------------------------------------------------ utilidades */

/** Trunca o texto para caber em w×h polegadas no tamanho (pt) informado. */
export function caber(texto: string, w: number, tam: number, linhas = 1): string {
  const porLinha = Math.max(4, Math.floor((w * 72) / (tam * 0.53)))
  const max = porLinha * linhas
  if (texto.length <= max) return texto
  return `${texto.slice(0, max - 1).trimEnd()}…`
}
/** Maior tamanho (pt) até `max` em que o texto cabe em uma linha de largura w. */
export const tamanhoQueCabe = (texto: string, w: number, max: number, min = 12) => Math.max(min, Math.min(max, Math.floor((w * 72) / (Math.max(1, texto.length) * 0.56))))
const semSimbolo = (t: string) => t.replace(/^[↗↘→✓!▲–?]\s*/, '')
const linhasCabem = (h: number, tam: number) => Math.max(1, Math.floor((h * 72) / (tam * 1.22)))

export function formatoDe(unidade: string, casas: number): FormatoNum {
  if (unidade === '%') return { casas, sufixo: '%', moeda: false }
  if (unidade === 'R$') return { casas: 0, sufixo: '', moeda: true }
  return { casas: unidade === 'qtd' ? 0 : Math.min(casas, 2), sufixo: '', moeda: false }
}
export function formatar(f: FormatoNum, v: number): string {
  if (f.moeda) return Math.abs(v) >= 1000 ? `R$ ${numero(v / 1000, 1)} mil` : `R$ ${numero(v, 0)}`
  return `${numero(v, f.casas)}${f.sufixo}`
}

const TOM_COR: Record<Tom, { cor: string; fundo: string }> = {
  vinho: { cor: COR.vinho, fundo: COR.rosaClaro },
  critico: { cor: STATUS_REL.VERMELHO.cor, fundo: STATUS_REL.VERMELHO.fundo },
  atencao: { cor: STATUS_REL.AMARELO.cor, fundo: STATUS_REL.AMARELO.fundo },
  ok: { cor: STATUS_REL.VERDE.cor, fundo: STATUS_REL.VERDE.fundo },
  neutro: { cor: COR.neutro, fundo: COR.neutroFundo },
  dourado: { cor: COR.douradoEscuro, fundo: 'F4EAD2' },
}

const txt = (x: number, y: number, w: number, h: number, texto: string, tam: number, cor: string, extra: Partial<Extract<El, { k: 'txt' }>> = {}): El =>
  ({ k: 'txt', x, y, w, h, runs: [{ texto }], tam, cor, fonte: 'corpo', ...extra })
const card = (x: number, y: number, w: number, h: number, fill: string = COR.branco): El => ({ k: 'ret', x, y, w, h, fill, linha: 'E6E1DC', raio: 0.12 })

const X0 = 0.6
const LARG = G.largura - 2 * X0
const Y_FIM = 6.78

/* ------------------------------------------------------------------ moldura */

function cabecalho(titulo: string, tag: string | null): El[] {
  const els: El[] = [txt(X0, 0.4, tag ? 9.5 : LARG, 0.66, caber(titulo, tag ? 9.5 : LARG, 24), 24, COR.vinho, { fonte: 'titulo', negrito: true, valign: 'm' })]
  if (tag) {
    els.push({ k: 'txt', x: 10.43, y: 0.5, w: 2.3, h: 0.42, runs: [{ texto: tag }], tam: 11, cor: COR.vinho, negrito: true, alinhar: 'c', valign: 'm', fill: 'F1E6C8', raio: 0.21, fonte: 'titulo' })
  }
  return els
}

function rodape(d: DadosRelatorio, n: number, total: number, claro = false): El[] {
  const m = d.metadados
  const c = claro ? 'E9D3D6' : COR.neutro
  const seloCor = claro ? COR.branco : m.selo === 'OFICIAL' ? STATUS_REL.VERDE.cor : COR.vermelho
  return [
    txt(X0, 6.9, 7.2, 0.28, `Costa Lavos • Relatório Executivo • ${m.competenciaRotulo}`, 8.5, c, { valign: 'm' }),
    { k: 'txt', x: 7.9, y: 6.9, w: 4.83, h: 0.28, alinhar: 'r', valign: 'm', tam: 8.5, cor: c, fonte: 'corpo',
      runs: [{ texto: m.selo, negrito: true, cor: seloCor }, { texto: `  •  v${String(m.versao ?? 0).padStart(2, '0')}  •  ${n} / ${total}` }] },
  ]
}

/* ------------------------------------------------------------------ componentes */

function pilulaStatus(i: IndicadorRelatorio, x: number, y: number, w: number): El {
  const s = STATUS_REL[i.mes.status]
  return { k: 'txt', x, y, w, h: 0.3, runs: [{ texto: `${s.simbolo}  ${s.texto}` }], tam: 9.5, cor: s.cor, fill: s.fundo, negrito: true, alinhar: 'c', valign: 'm', raio: 0.15, fonte: 'corpo' }
}

function cartaoIndicador(i: IndicadorRelatorio, x: number, y: number, w: number, h: number, link?: number): El[] {
  const els: El[] = [card(x, y, w, h)]
  const pad = 0.16
  const iw = w - 2 * pad
  const corValor = i.mes.status === 'VERMELHO' ? COR.vermelho : COR.vinho
  els.push(txt(x + pad, y + 0.12, iw, 0.22, caber(`${i.areaNome} • ${i.classe.toLowerCase()}`.toUpperCase(), iw, 7.5), 7.5, COR.neutro, { negrito: true }))
  els.push({ ...txt(x + pad, y + 0.34, iw, 0.44, caber(i.nome, iw, 11, 2), 11, COR.tinta, { negrito: true, fonte: 'titulo' }), ...(link ? { link } : {}) } as El)
  const tv = tamanhoQueCabe(i.mes.texto, iw, 24)
  els.push(txt(x + pad, y + 0.8, iw, 0.52, caber(i.mes.texto, iw, tv), tv, corValor, { negrito: true, fonte: 'titulo', valign: 'm' }))
  els.push(pilulaStatus(i, x + pad, y + 1.38, Math.min(iw, 1.75)))
  const lin = (yy: number, rot: string, val: string) => ({ k: 'txt', x: x + pad, y: yy, w: iw, h: 0.22, tam: 8.5, cor: COR.tinta, fonte: 'corpo', valign: 'm',
    runs: [{ texto: `${rot} `, negrito: true, cor: COR.neutro }, { texto: caber(val, iw - 0.9, 8.5) }] } as El)
  els.push(lin(y + 1.76, 'Meta:', i.mes.metaTexto))
  els.push(lin(y + 1.98, 'Mês ant.:', i.mes.valorAnterior === null ? i.mes.anteriorTexto : `${i.mes.anteriorTexto} • var. ${i.mes.variacaoTexto}`))
  els.push(lin(y + 2.2, 'Acum. ano:', `${i.ano.texto} • ${i.tendenciaTexto}`))
  if (h > 2.62) els.push(lin(y + 2.42, 'Trim./Sem.:', `${i.trimestre.texto} / ${i.semestre.texto}`))
  return els
}

function graficoEvolucao(i: IndicadorRelatorio, x: number, y: number, w: number, h: number): El[] {
  const f = formatoDe(i.unidade, i.casas)
  const els: El[] = [card(x, y, w, h)]
  els.push(txt(x + 0.2, y + 0.12, w - 0.4, 0.3, caber(`Evolução mensal — ${i.nome}`, w - 0.4, 11), 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  if (i.evolucao.every((p) => p.valor === null)) {
    els.push(txt(x + 0.3, y + 0.6, w - 0.6, h - 0.8, `Sem dados informados de ${i.evolucao[0]?.rotulo ?? ''} a ${i.evolucao[i.evolucao.length - 1]?.rotulo ?? ''}. ${i.mes.motivo ?? ''}`.trim(), 12, COR.neutro, { alinhar: 'c', valign: 'm', italico: true }))
    return els
  }
  const cats = i.evolucao.map((p) => p.rotulo)
  const meta = i.mes.alvo !== null ? { valor: i.mes.alvo, rotulo: `Meta ${i.mes.metaTexto}` } : null
  els.push({ k: 'graf', x: x + 0.15, y: y + 0.45, w: w - 0.3, h: h - 0.55, g: {
    t: 'colunas', categorias: cats, series: [{ nome: i.nome, valores: i.evolucao.map((p) => p.valor), cor: COR.pedra }],
    destacarUltimo: true, meta, formato: f, legenda: false, titulo: `Evolução mensal — ${i.nome}`,
  } })
  return els
}

function graficoQuebra(q: Quebra, x: number, y: number, w: number, h: number, titulo?: string): El[] {
  const f: FormatoNum = q.unidade === 'R$' ? { casas: 0, sufixo: '', moeda: true } : { casas: 0, sufixo: '', moeda: false }
  const els: El[] = [card(x, y, w, h)]
  els.push(txt(x + 0.2, y + 0.12, w - 0.4, 0.3, caber(titulo ?? `Comparativo por ${q.dimensaoRotulo.toLowerCase()}`, w - 0.4, 11), 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const itens = q.itens.slice(0, 7)
  if (q.tipo === 'PARETO') {
    els.push({ k: 'graf', x: x + 0.15, y: y + 0.45, w: w - 0.3, h: h - 0.55, g: {
      t: 'pareto', categorias: itens.map((i) => i.dimensao), valores: itens.map((i) => i.atual), acumulado: itens.map((i) => Number(i.acumulado.toFixed(1))),
      classeA: itens.map((i) => i.classeA), formato: f, titulo: q.titulo,
    } })
  } else {
    const cores = ['E4E0DC', COR.pedra, COR.vermelho]
    els.push({ k: 'graf', x: x + 0.15, y: y + 0.45, w: w - 0.3, h: h - 0.55, g: {
      t: 'colunas', categorias: itens.map((i) => i.dimensao),
      series: q.rotulosMeses.map((r, k) => ({ nome: r, valores: itens.map((i) => i.valores[k]), cor: cores[k] })),
      destacarUltimo: false, meta: null, formato: f, legenda: true, titulo: q.titulo,
    } })
  }
  return els
}

function ranking(q: Quebra, x: number, y: number, w: number, h: number): El[] {
  const els: El[] = [card(x, y, w, h)]
  els.push(txt(x + 0.2, y + 0.12, w - 0.4, 0.3, `Ranking de ${q.rotulosMeses[2]}`, 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const itens = q.itens.filter((i) => i.atual > 0).slice(0, 7)
  const max = Math.max(1, ...itens.map((i) => i.atual))
  const lh = Math.min(0.62, (h - 0.6) / Math.max(1, itens.length))
  const iw = w - 0.4
  itens.forEach((it, k) => {
    const yy = y + 0.55 + k * lh
    const val = q.unidade === 'R$' ? formatar({ casas: 0, sufixo: '', moeda: true }, it.atual) : numero(it.atual, 0)
    els.push(txt(x + 0.2, yy, iw - 1.3, 0.24, caber(it.dimensao.toUpperCase(), iw - 1.3, 8.5), 8.5, COR.tinta, { valign: 'm' }))
    els.push(txt(x + 0.2 + iw - 1.3, yy, 1.3, 0.24, val, 11, COR.vermelho, { negrito: true, alinhar: 'r', valign: 'm', fonte: 'titulo' }))
    els.push({ k: 'ret', x: x + 0.2, y: yy + 0.28, w: iw, h: 0.1, fill: 'EFE6D6', raio: 0.05 })
    els.push({ k: 'ret', x: x + 0.2, y: yy + 0.28, w: Math.max(0.04, (it.atual / max) * iw), h: 0.1, fill: 'C9A45C', raio: 0.05 })
  })
  if (!itens.length) els.push(txt(x + 0.2, y + 0.6, iw, 0.4, 'Sem ocorrências no mês.', 10, COR.neutro))
  return els
}

function tabela(x: number, y: number, w: number, larguras: number[], cab: string[], linhas: string[][], alinhamento: ('esquerda' | 'direita' | 'centro')[], opts: { tam?: number; alturaLinha?: number; tons?: (Tom | null)[]; colunaStatus?: number } = {}): El {
  const soma = larguras.reduce((s, v) => s + v, 0)
  const colW = larguras.map((l) => Number(((l / soma) * w).toFixed(3)))
  const tam = opts.tam ?? 10
  return {
    k: 'tab', x, y, w, colW, cab, tam, alinhamento, alturaLinha: opts.alturaLinha ?? 0.36,
    linhas: linhas.map((l, r) => l.map((c, i) => {
      const tom = opts.tons?.[r]
      const base = { texto: caber(c, colW[i] - 0.12, tam, 2) }
      if (opts.colunaStatus === i) {
        const st = (Object.values(STATUS_REL).find((s) => c.includes(s.texto)) ?? STATUS_REL.NA)
        return { ...base, cor: st.cor, negrito: true, fill: st.fundo }
      }
      return tom ? { ...base, cor: TOM_COR[tom].cor, negrito: i === l.length - 1 } : base
    })),
  }
}

/* ------------------------------------------------------------------ slides */

function capa(d: DadosRelatorio): El[] {
  const m = d.metadados
  const titulo = m.escopo === 'CONSOLIDADO' ? 'Apresentação da Diretoria' : `Apresentação da Diretoria — ${m.escopoRotulo}`
  const els: El[] = [{ k: 'ret', x: 0, y: 0, w: G.largura, h: G.altura, fill: COR.vinho }]
  els.push({ k: 'ret', x: 0, y: 0, w: 0.28, h: G.altura, fill: COR.vermelho })
  if (m.logotipo) els.push({ k: 'img', x: X0 + 0.3, y: 0.7, w: 2.2, h: 0.9, mime: m.logotipo.mime, base64: m.logotipo.base64 })
  else els.push(txt(X0 + 0.3, 0.7, 5, 0.6, 'Costa Lavos', 22, COR.branco, { negrito: true, fonte: 'titulo' }))
  els.push(txt(X0 + 0.3, 2.1, 11.5, 1.0, caber(titulo, 11.5, 40), 40, COR.branco, { fonte: 'capa', valign: 'm' }))
  els.push(txt(X0 + 0.3, 3.15, 11.5, 0.6, `Relatório Executivo • ${m.competenciaRotulo}`, 24, COR.dourado, { fonte: 'titulo', negrito: true }))
  els.push(txt(X0 + 0.3, 3.8, 11.5, 0.4, `${m.escopoRotulo} • Modo ${m.modoRotulo.toLowerCase()} • ${m.unidadesRotulo}`, 14, 'F3E3E6', {}))
  // Faixa de metadados
  els.push({ k: 'ret', x: X0 + 0.3, y: 4.75, w: 11.8, h: 1.55, fill: '7D1C31', raio: 0.14 })
  const campos: [string, string][] = [
    ['Versão', `v${String(m.versao ?? 0).padStart(2, '0')}`],
    ['Situação', m.selo === 'OFICIAL' ? 'OFICIAL' : 'PRELIMINAR'],
    ['Gerado em', m.geradoEmTexto],
    ['Gerado por', m.usuario],
  ]
  campos.forEach(([r, v], k) => {
    const cx = X0 + 0.6 + k * 2.9
    els.push(txt(cx, 4.95, 2.7, 0.28, r.toUpperCase(), 9, 'E9D3D6', { negrito: true }))
    els.push(txt(cx, 5.25, 2.7, 0.45, caber(v, 2.7, 15), 15, k === 1 ? (m.selo === 'OFICIAL' ? 'BFE8CF' : 'FFD7D7') : COR.branco, { negrito: true, fonte: 'titulo' }))
  })
  els.push(txt(X0 + 0.6, 5.8, 11.2, 0.35, m.selo === 'OFICIAL' ? 'Todas as áreas do escopo com fechamento aprovado.' : caber(`Pendente de aprovação: ${m.pendentesRotulo.join(', ')}.`, 11.2, 10), 10, 'F3E3E6'))
  return els
}

function contexto(d: DadosRelatorio): El[] {
  const m = d.metadados
  const els: El[] = [card(X0, 1.3, 5.9, 5.4), txt(X0 + 0.25, 1.45, 5.4, 0.35, 'Identificação do relatório', 13, COR.vinho, { negrito: true, fonte: 'titulo' })]
  const linhas: [string, string][] = [
    ['Competência', m.competenciaRotulo], ['Escopo', m.escopoRotulo], ['Modo', m.modoRotulo], ['Unidades', m.unidadesRotulo],
    ['Versão', `v${String(m.versao ?? 0).padStart(2, '0')}`], ['Situação', `${m.selo}${m.pendentes.length ? ` — ${m.pendentes.length > 2 ? `${m.pendentes.length} áreas pendentes de aprovação` : `pendente: ${m.pendentesRotulo.join(', ')}`}` : ''}`],
    ['Gerado em', `${m.geradoEmTexto} (horário de Brasília)`], ['Gerado por', m.usuario], ['Hash dos dados', d.hash.slice(0, 16)],
  ]
  linhas.forEach(([r, v], k) => {
    const yy = 1.95 + k * 0.5
    els.push(txt(X0 + 0.25, yy, 1.6, 0.44, r, 10, COR.neutro, { negrito: true, valign: 'm' }))
    els.push(txt(X0 + 1.9, yy, 3.85, 0.44, caber(v, 3.85, 10.5, 2), 10.5, COR.tinta, { valign: 'm' }))
    if (k < linhas.length - 1) els.push({ k: 'ret', x: X0 + 0.25, y: yy + 0.47, w: 5.4, h: 0.01, fill: 'ECE7E2' })
  })
  const xr = X0 + 6.15
  const wr = LARG - 6.15
  els.push(card(xr, 1.3, wr, 2.35), txt(xr + 0.25, 1.45, wr - 0.5, 0.35, 'Regra do semáforo', 13, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const regras: [keyof typeof STATUS_REL, string][] = [
    ['VERDE', 'Atingiu a meta.'], ['AMARELO', 'Fora da meta até 5% de tolerância.'], ['VERMELHO', 'Além da tolerância — exige plano de ação.'],
  ]
  regras.forEach(([s, t], k) => {
    const yy = 1.95 + k * 0.52
    const st = STATUS_REL[s]
    els.push({ k: 'txt', x: xr + 0.25, y: yy, w: 1.7, h: 0.36, runs: [{ texto: `${st.simbolo}  ${st.texto}` }], tam: 10, cor: st.cor, fill: st.fundo, negrito: true, alinhar: 'c', valign: 'm', raio: 0.18, fonte: 'corpo' })
    els.push(txt(xr + 2.1, yy, wr - 2.35, 0.36, t, 10.5, COR.tinta, { valign: 'm' }))
  })
  els.push(card(xr, 3.85, wr, 2.85), txt(xr + 0.25, 4.0, wr - 0.5, 0.35, 'Situação do fechamento por área', 13, COR.vinho, { negrito: true, fonte: 'titulo' }))
  m.fechamento.forEach((f, k) => {
    const yy = 4.45 + k * 0.42
    const aprovado = ['APROVADO', 'FECHADO'].includes(f.status)
    els.push(txt(xr + 0.25, yy, 3.3, 0.36, `${f.areaNome}${f.noEscopo ? '' : ' (fora do escopo)'}`, 10.5, f.noEscopo ? COR.tinta : COR.neutro, { valign: 'm' }))
    els.push({ k: 'txt', x: xr + wr - 2.25, y: yy + 0.03, w: 2.0, h: 0.3, runs: [{ texto: `${aprovado ? '✓' : '!'}  ${f.statusRotulo}` }], tam: 9.5,
      cor: aprovado ? STATUS_REL.VERDE.cor : STATUS_REL.AMARELO.cor, fill: aprovado ? STATUS_REL.VERDE.fundo : STATUS_REL.AMARELO.fundo, negrito: true, alinhar: 'c', valign: 'm', raio: 0.15, fonte: 'corpo' })
  })
  return els
}

function resumo(d: DadosRelatorio, s: Extract<Slide, { tipo: 'RESUMO' }>): El[] {
  const els: El[] = [card(X0, 1.3, 7.7, 5.4), txt(X0 + 0.3, 1.45, 7.1, 0.35, 'Mensagens-chave', 13, COR.vinho, { negrito: true, fonte: 'titulo' })]
  const n = Math.max(1, s.mensagens.length)
  const bloco = Math.min(1.6, 4.7 / n)
  s.mensagens.forEach((msg, k) => {
    const yy = 1.95 + k * bloco
    els.push({ k: 'txt', x: X0 + 0.3, y: yy, w: 0.46, h: 0.46, runs: [{ texto: String(s.inicio + k + 1) }], tam: 15, cor: COR.branco, fill: COR.vinho, raio: 0.23, negrito: true, alinhar: 'c', valign: 'm', fonte: 'titulo' })
    els.push(txt(X0 + 0.95, yy - 0.04, 6.45, bloco - 0.1, caber(msg, 6.45, 13, linhasCabem(bloco - 0.1, 13)), 13, COR.tinta, {}))
  })
  if (!s.mensagens.length) els.push(txt(X0 + 0.3, 2.0, 7, 0.5, 'Sem mensagens registradas.', 12, COR.neutro))
  const xr = X0 + 7.95
  const wr = LARG - 7.95
  const cont: [keyof typeof STATUS_REL, number][] = [['VERDE', d.semaforo.verde], ['AMARELO', d.semaforo.amarelo], ['VERMELHO', d.semaforo.vermelho], ['SEM_META', d.semaforo.semMeta + d.semaforo.na]]
  const cw = (wr - 0.2) / 2
  cont.forEach(([st, v], k) => {
    const cx = xr + (k % 2) * (cw + 0.2)
    const cy = 1.3 + Math.floor(k / 2) * 1.75
    const e = STATUS_REL[st]
    els.push({ k: 'ret', x: cx, y: cy, w: cw, h: 1.55, fill: e.fundo, linha: 'E6E1DC', raio: 0.12 })
    els.push(txt(cx + 0.2, cy + 0.15, cw - 0.4, 0.75, String(v), 34, e.cor, { negrito: true, fonte: 'titulo', valign: 'm' }))
    els.push(txt(cx + 0.2, cy + 0.95, cw - 0.4, 0.45, `${e.simbolo}  ${st === 'SEM_META' ? 'Sem meta / sem dado' : e.texto}`, 11, e.cor, { negrito: true, valign: 'm' }))
  })
  els.push(txt(xr, 4.85, wr, 0.3, `Base: ${d.semaforo.total} indicador(es) essencial(is) no mês.`, 9.5, COR.neutro))
  const vermelhos = d.indicadores.filter((i) => i.classe === 'ESSENCIAL' && i.mes.status === 'VERMELHO').slice(0, 4)
  if (vermelhos.length) {
    els.push(card(xr, 5.2, wr, 1.5), txt(xr + 0.2, 5.3, wr - 0.4, 0.28, 'Exigem plano de ação', 10.5, COR.vermelho, { negrito: true }))
    vermelhos.forEach((i, k) => els.push(txt(xr + 0.2, 5.6 + k * 0.26, wr - 0.4, 0.26, caber(`▲ ${i.nome}: ${i.mes.texto}`, wr - 0.4, 9), 9, COR.tinta)))
  }
  return els
}

function semaforo(s: Extract<Slide, { tipo: 'SEMAFORO' }>): El[] {
  const linhas = s.indicadores.map((i) => [i.nome, i.areaNome, i.mes.texto, i.mes.metaTexto, i.mes.statusTexto, i.mes.anteriorTexto, i.ano.texto])
  return [tabela(X0, 1.3, LARG, [3.6, 2, 1.4, 1.5, 1.8, 1.4, 1.4], ['Indicador', 'Área', 'Realizado', 'Meta', 'Status', 'Mês anterior', 'Acum. ano'], linhas,
    ['esquerda', 'esquerda', 'direita', 'direita', 'esquerda', 'direita', 'direita'], { colunaStatus: 4, alturaLinha: 0.46, tam: 10 })]
}

function lista(s: Extract<Slide, { tipo: 'LISTA' }>): El[] {
  const els: El[] = []
  const cols = s.grupos.length > 1 ? 2 : 1
  const cw = (LARG - (cols - 1) * 0.25) / cols
  const porCol: typeof s.grupos[] = cols === 1 ? [s.grupos] : [[], []]
  if (cols === 2) {
    let a = 0, b = 0
    for (const g of s.grupos) { if (a <= b) { porCol[0].push(g); a += g.itens.length + 1 } else { porCol[1].push(g); b += g.itens.length + 1 } }
  }
  porCol.forEach((gs, c) => {
    const cx = X0 + c * (cw + 0.25)
    const totalItens = gs.reduce((sum, g) => sum + g.itens.length, 0) || 1
    const disp = 5.4 - gs.length * 0.6 - (gs.length - 1) * 0.2
    let yy = 1.3
    for (const g of gs) {
      const gh = Math.min(0.75 + g.itens.length * 0.8, 0.6 + (disp * g.itens.length) / totalItens)
      const t = TOM_COR[g.tom]
      els.push(card(cx, yy, cw, gh))
      els.push({ k: 'ret', x: cx, y: yy, w: 0.1, h: gh, fill: t.cor, raio: 0.05 })
      els.push(txt(cx + 0.3, yy + 0.12, cw - 0.5, 0.34, g.titulo, 13, t.cor, { negrito: true, fonte: 'titulo' }))
      const ih = (gh - 0.6) / Math.max(1, g.itens.length)
      g.itens.forEach((it, k) => {
        const iy = yy + 0.52 + k * ih
        const linhasTexto = Math.max(1, Math.min(3, linhasCabem(ih - 0.28, 11.5)))
        els.push({ k: 'txt', x: cx + 0.3, y: iy, w: cw - 0.55, h: ih - 0.24 > 0.3 ? ih - 0.26 : 0.3, tam: 11.5, cor: COR.tinta, fonte: 'corpo',
          runs: [{ texto: '• ', negrito: true, cor: t.cor }, { texto: caber(it.texto, cw - 0.7, 11.5, linhasTexto) }] })
        if (it.detalhe) els.push(txt(cx + 0.45, iy + Math.max(0.3, ih - 0.26), cw - 0.7, 0.22, caber(it.detalhe, cw - 0.7, 8.5), 8.5, COR.neutro))
      })
      yy += gh + 0.2
    }
  })
  return els
}

function painelComentarios(s: Extract<Slide, { tipo: 'INDICADORES' }>, x: number, y: number, w: number, h: number): El[] {
  const els: El[] = [card(x, y, w, h)]
  const temComentario = s.comentarios.length > 0
  els.push(txt(x + 0.2, y + 0.12, w - 0.4, 0.3, temComentario ? 'Comentário executivo' : 'Leitura do mês', 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const itens = temComentario ? s.comentarios : s.indicadores.map((i) => `${i.nome}: ${semSimbolo(i.mes.statusTexto).toLowerCase()}; ${semSimbolo(i.tendenciaTexto).toLowerCase()}.`)
  const ih = Math.min(1.1, (h - 0.55) / Math.max(1, itens.length))
  itens.forEach((t, k) => els.push({ k: 'txt', x: x + 0.2, y: y + 0.5 + k * ih, w: w - 0.4, h: ih - 0.06, tam: 10, cor: COR.tinta, fonte: 'corpo',
    runs: [{ texto: '• ', negrito: true, cor: COR.vinho }, { texto: caber(t, w - 0.5, 10, linhasCabem(ih - 0.06, 10)) }] }))
  return els
}

function indicadores(d: DadosRelatorio, s: Extract<Slide, { tipo: 'INDICADORES' }>, deck: Deck): El[] {
  const els: El[] = []
  const n = Math.max(1, s.indicadores.length)
  const gap = 0.2
  const destaque = s.indicadores.find((i) => i.mes.status === 'VERMELHO') ?? s.indicadores[0]
  const Y0 = 1.25
  const altura = Y_FIM - Y0
  if (n <= 2) {
    // Cartões empilhados à esquerda; gráficos à direita.
    const wl = 4.3
    const ch = 2.66
    s.indicadores.forEach((i, k) => els.push(...cartaoIndicador(i, X0, Y0 + k * (ch + gap), wl, ch, deck.apendicePorCodigo[i.codigo])))
    const xr = X0 + wl + 0.25
    const wr = LARG - wl - 0.25
    if (!destaque) return els
    if (s.quebra) {
      const hg = (altura - gap) / 2
      els.push(...graficoEvolucao(destaque, xr, Y0, wr, hg))
      els.push(...graficoQuebra(s.quebra, xr, Y0 + hg + gap, wr, hg, `${s.quebra.titulo} (${s.quebra.rotulosMeses.join(' • ')})`))
      if (n === 1) els.push(...painelComentarios(s, X0, Y0 + ch + gap, wl, altura - ch - gap))
    } else if (n === 1) {
      els.push(...graficoEvolucao(destaque, xr, Y0, wr, altura))
      els.push(...painelComentarios(s, X0, Y0 + ch + gap, wl, altura - ch - gap))
    } else {
      const hg = altura * 0.62
      els.push(...graficoEvolucao(destaque, xr, Y0, wr, hg))
      els.push(...painelComentarios(s, xr, Y0 + hg + gap, wr, altura - hg - gap))
    }
    return els
  }
  const cw = (LARG - gap * (n - 1)) / n
  const ch = 2.45
  s.indicadores.forEach((i, k) => els.push(...cartaoIndicador(i, X0 + k * (cw + gap), Y0, cw, ch, deck.apendicePorCodigo[i.codigo])))
  let y0 = Y0 + ch + gap
  if (s.quebra && s.comentarios.length) {
    els.push({ k: 'txt', x: X0, y: y0, w: LARG, h: 0.36, tam: 10, cor: COR.tinta, fonte: 'corpo', valign: 'm', fill: 'F7F1E6', raio: 0.1,
      runs: [{ texto: '  Comentário executivo: ', negrito: true, cor: COR.vinho }, { texto: caber(s.comentarios.join(' | '), LARG - 2.2, 10) }] })
    y0 += 0.48
  }
  const h = Y_FIM - y0
  if (!destaque) return els
  if (s.quebra) {
    const wl = (LARG - 0.25) / 2
    els.push(...graficoEvolucao(destaque, X0, y0, wl, h))
    els.push(...graficoQuebra(s.quebra, X0 + wl + 0.25, y0, wl, h, `${s.quebra.titulo} (${s.quebra.rotulosMeses.join(' • ')})`))
  } else {
    const wl = 7.85
    els.push(...graficoEvolucao(destaque, X0, y0, wl, h))
    els.push(...painelComentarios(s, X0 + wl + 0.25, y0, LARG - wl - 0.25, h))
  }
  return els
}

function quebra(s: Extract<Slide, { tipo: 'QUEBRA' }>): El[] {
  const q = s.quebra
  const els: El[] = []
  const cw = (LARG - 0.6) / 4
  q.rotulosMeses.forEach((r, k) => {
    const x = X0 + k * (cw + 0.2)
    const atual = k === 2
    els.push({ k: 'ret', x, y: 1.25, w: cw, h: 1.3, fill: atual ? COR.vermelho : COR.branco, linha: atual ? COR.vermelho : 'E6E1DC', raio: 0.12 })
    els.push(txt(x + 0.2, 1.35, cw - 0.4, 0.3, r.toUpperCase(), 11, atual ? 'F4D9A8' : COR.neutro, { negrito: true }))
    els.push(txt(x + 0.2, 1.65, cw - 0.4, 0.55, q.totaisTexto[k], tamanhoQueCabe(q.totaisTexto[k], cw - 0.4, 24), atual ? COR.branco : COR.vermelho, { negrito: true, fonte: 'titulo', valign: 'm' }))
    if (atual) els.push(txt(x + 0.2, 2.2, cw - 0.4, 0.26, 'Resultado atual', 10, 'F4D9A8', { negrito: true }))
  })
  const xv = X0 + 3 * (cw + 0.2)
  els.push(card(xv, 1.25, cw, 1.3))
  const [a, b, c] = q.totais
  els.push(txt(xv + 0.2, 1.35, cw - 0.4, 0.3, `VARIAÇÃO ${q.rotulosMeses[2].slice(0, 3).toUpperCase()} vs ${q.rotulosMeses[1].slice(0, 3).toUpperCase()}`, 10, COR.neutro, { negrito: true }))
  let vtxt = 'Sem comparação'
  if (b !== null && c !== null && b !== 0) {
    const v = ((c - b) / Math.abs(b)) * 100
    vtxt = `${v > 0 ? '↗ +' : v < 0 ? '↘ −' : '→ '}${numero(Math.abs(v), 1)}%`
  }
  els.push(txt(xv + 0.2, 1.65, cw - 0.4, 0.5, vtxt, 20, COR.tinta, { negrito: true, fonte: 'titulo', valign: 'm' }))
  const validos = [a, b, c].filter((v): v is number => v !== null)
  if (validos.length) {
    const media = validos.reduce((s2, v) => s2 + v, 0) / validos.length
    els.push(txt(xv + 0.2, 2.2, cw - 0.4, 0.26, `Média dos ${validos.length} meses: ${q.unidade === 'R$' ? formatar({ casas: 0, sufixo: '', moeda: true }, media) : numero(media, 0)}`, 9, COR.neutro))
  }
  const y0 = 2.75
  const wl = 7.7
  els.push(...graficoQuebra(q, X0, y0, wl, Y_FIM - y0, q.tipo === 'PARETO' ? `Pareto de ${q.rotulosMeses[2]} (acumulado e referência de 80%)` : undefined))
  els.push(...ranking(q, X0 + wl + 0.25, y0, LARG - wl - 0.25, Y_FIM - y0 - 0.3))
  els.push(txt(X0 + wl + 0.25, Y_FIM - 0.26, LARG - wl - 0.25, 0.24, caber(`Fonte: ${q.fonte}`, LARG - wl - 0.25, 8), 8, COR.neutro, { alinhar: 'r' }))
  return els
}

function tabelaSlide(s: Extract<Slide, { tipo: 'TABELA' }>): El[] {
  const els: El[] = []
  let y = 1.25
  if (s.subtitulo) { els.push(txt(X0, 1.15, LARG, 0.32, caber(s.subtitulo, LARG, 11), 11, COR.neutro)); y = 1.6 }
  els.push(tabela(X0, y, LARG, s.larguras, s.colunas, s.linhas, s.alinhamento, { tons: s.tons, tam: 10, alturaLinha: Math.min(0.44, (Y_FIM - y) / (s.linhas.length + 1)) }))
  return els
}

function apendice(s: Extract<Slide, { tipo: 'APENDICE' }>, deck: Deck): El[] {
  const i = s.indicador
  const els: El[] = [card(X0, 1.25, 6.3, 5.5), txt(X0 + 0.25, 1.38, 5.8, 0.32, 'Memória de cálculo', 13, COR.vinho, { negrito: true, fonte: 'titulo' })]
  const campos: [string, string][] = [
    ['Código', i.codigo], ['Área / classe', `${i.areaNome} • ${i.classe.toLowerCase()}`], ['Fórmula', i.formula],
    ['Consolidação', `${i.consolidacao.toLowerCase().replace('_', ' ')} — ${i.ano.regra}`], ['Origem dos dados', i.origemDados],
    ['Meta do mês', i.mes.metaTexto], ['Situação do dado', i.mes.motivo ?? (i.mes.situacao === 'OK' ? 'Dado completo' : i.mes.situacao)],
    ['Fonte da regra', i.fonteRegra], ['Pendências', i.pendencias ?? 'Nenhuma'],
  ]
  campos.forEach(([r, v], k) => {
    const yy = 1.8 + k * 0.54
    els.push(txt(X0 + 0.25, yy, 1.55, 0.5, r, 9, COR.neutro, { negrito: true }))
    els.push(txt(X0 + 1.85, yy, 4.25, 0.5, caber(v, 4.25, 9, 3), 9, COR.tinta))
  })
  const xr = X0 + 6.55
  const wr = LARG - 6.55
  els.push(txt(xr, 1.25, wr, 0.3, 'Resultado por período', 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const per = [i.mes, i.trimestre, i.semestre, i.ano].map((p) => [p.rotulo, p.texto, p.metaTexto, p.statusTexto])
  els.push(tabela(xr, 1.58, wr, [1.6, 1.3, 1.5, 1.7], ['Período', 'Realizado', 'Meta', 'Status'], per, ['esquerda', 'direita', 'direita', 'esquerda'], { tam: 9, alturaLinha: 0.3, colunaStatus: 3 }))
  els.push(txt(xr, 3.25, wr, 0.3, 'Série mensal (base dos acumulados)', 11, COR.vinho, { negrito: true, fonte: 'titulo' }))
  const meses = i.evolucao.map((p) => [p.rotulo, p.texto, p.situacao === 'OK' ? 'Completo' : p.situacao === 'NAO_APLICAVEL' ? 'Não se aplica' : 'Não informado'])
  els.push(tabela(xr, 3.58, wr, [1.6, 2, 2.5], ['Mês', 'Valor', 'Situação do dado'], meses, ['esquerda', 'direita', 'esquerda'], { tam: 8.5, alturaLinha: Math.min(0.26, 3.0 / (meses.length + 1)) }))
  const volta = deck.slidePorCodigo[i.codigo]
  if (volta) els.push({ ...txt(xr, Y_FIM - 0.1, wr, 0.24, `Indicador apresentado no slide ${volta} — clique para voltar`, 8.5, COR.vinho, { alinhar: 'r', italico: true }), link: volta } as El)
  return els
}

/* ------------------------------------------------------------------ montagem */

function tagDe(d: DadosRelatorio, s: Slide): string | null {
  if (s.tipo === 'INDICADORES' || s.tipo === 'QUEBRA') return d.metadados.mesesTag
  if (s.tipo === 'SEMAFORO' || s.tipo === 'RESUMO') return d.metadados.competenciaCurta.toUpperCase()
  return null
}

export function diagramar(d: DadosRelatorio, deck: Deck = montarDeck(d)): SlidePosicionado[] {
  const total = deck.slides.length
  return deck.slides.map((s, idx) => {
    const n = idx + 1
    if (s.tipo === 'CAPA') return { els: [...capa(d), ...rodape(d, n, total, true)], titulo: 'Capa', fundo: COR.vinho }
    const moldura: El[] = [{ k: 'ret', x: 0.18, y: 0.18, w: G.largura - 0.36, h: G.altura - 0.36, fill: COR.creme, raio: 0.16 }]
    const titulo = s.titulo
    let corpo: El[] = []
    switch (s.tipo) {
      case 'CONTEXTO': corpo = contexto(d); break
      case 'RESUMO': corpo = resumo(d, s); break
      case 'SEMAFORO': corpo = semaforo(s); break
      case 'LISTA': corpo = lista(s); break
      case 'INDICADORES': corpo = indicadores(d, s, deck); break
      case 'QUEBRA': corpo = quebra(s); break
      case 'TABELA': corpo = tabelaSlide(s); break
      case 'APENDICE': corpo = apendice(s, deck); break
    }
    return { els: [...moldura, ...cabecalho(titulo, tagDe(d, s)), ...corpo, ...rodape(d, n, total)], titulo, fundo: COR.vinho }
  })
}
