/**
 * Excel (exceljs): valores exportados (sem fórmulas como motor de cálculo), tabelas com
 * autofiltro, cabeçalho congelado, formatos numéricos pt-BR e datas reais (dd/mm/aaaa).
 */
import ExcelJS from 'exceljs'
import { COR, STATUS_REL } from './estilo'
import { SECOES } from './nomes'
import type { DadosRelatorio, DetalheTabela, IndicadorRelatorio } from './tipos'
import { AREAS } from '@/lib/auth/permissoes'

const ARGB = (c: string) => `FF${c}`

export function formatoNumeroExcel(unidade: string, casas: number): string {
  if (unidade === '%') return casas > 0 ? `0.${'0'.repeat(casas)}"%"` : '0"%"'
  if (unidade === 'R$') return '"R$" #,##0.00'
  if (unidade === 'qtd') return '#,##0'
  return casas > 0 ? `#,##0.${'0'.repeat(Math.min(casas, 4))}` : '#,##0'
}

/** 'YYYY-MM-DD' -> Date (UTC, sem deslocamento de fuso). */
function dataExcel(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v
  const s = String(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}
const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
/** Instante -> "hora de parede" de Brasília (o Excel não tem fuso). */
function dataHoraExcel(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(String(v))
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(FMT_SP.formatToParts(d).map((x) => [x.type, x.value]))
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)))
}

interface Coluna { titulo: string; largura?: number; formato?: string }

let contadorTabela = 0
/** Adiciona uma tabela do Excel (autofiltro + estilo) a partir da linha informada. Retorna a próxima linha livre. */
function adicionarTabela(ws: ExcelJS.Worksheet, linha: number, nome: string, colunas: Coluna[], linhas: unknown[][]): number {
  contadorTabela += 1
  const nomeTab = `${nome.replace(/[^A-Za-z0-9_]/g, '_')}_${contadorTabela}`
  const dados = linhas.length ? linhas : [colunas.map((_, i) => (i === 0 ? 'Sem registros' : null))]
  ws.addTable({
    name: nomeTab, ref: `A${linha}`, headerRow: true, totalsRow: false,
    style: { theme: 'TableStyleLight15', showRowStripes: true },
    columns: colunas.map((c) => ({ name: c.titulo, filterButton: true })),
    rows: dados as ExcelJS.CellValue[][],
  })
  const cab = ws.getRow(linha)
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: ARGB(COR.branco) } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(COR.vinho) } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  cab.height = 30
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    const largura = c.largura ?? Math.min(48, Math.max(12, c.titulo.length + 3, ...dados.slice(0, 200).map((l) => String(l[i] ?? '').length + 2)))
    col.width = Math.max(col.width ?? 0, largura)
    if (c.formato) for (let r = linha + 1; r <= linha + dados.length; r++) ws.getCell(r, i + 1).numFmt = c.formato
  })
  return linha + dados.length + 2
}

function titulo(ws: ExcelJS.Worksheet, linha: number, texto: string, tam = 14): number {
  const c = ws.getCell(linha, 1)
  c.value = texto
  c.font = { bold: true, size: tam, color: { argb: ARGB(COR.vinho) } }
  return linha + 1
}

const r6 = (v: number | null) => (v === null ? null : Math.round(v * 1e6) / 1e6)

function statusTexto(i: IndicadorRelatorio['mes']) {
  return `${STATUS_REL[i.status].simbolo} ${STATUS_REL[i.status].texto}`
}

export async function gerarXlsx(d: DadosRelatorio): Promise<Buffer> {
  contadorTabela = 0
  const m = d.metadados
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Costa Lavos — Sistema Gerencial'
  wb.title = `Relatório Executivo — ${m.competenciaRotulo}`
  wb.created = new Date(m.geradoEm)
  wb.calcProperties.fullCalcOnLoad = false

  /* ---------------- Resumo Executivo */
  const res = wb.addWorksheet('Resumo Executivo', { properties: { tabColor: { argb: ARGB(COR.vinho) } } })
  let l = titulo(res, 1, `Costa Lavos — Relatório Executivo — ${m.competenciaRotulo}`, 16)
  res.getCell(l, 1).value = `${m.escopoRotulo} • Modo ${m.modoRotulo.toLowerCase()} • v${String(m.versao ?? 0).padStart(2, '0')} • ${m.selo}${m.pendentes.length ? ` (pendente: ${m.pendentesRotulo.join(', ')})` : ''}`
  res.getCell(l, 1).font = { bold: true, color: { argb: ARGB(m.selo === 'OFICIAL' ? STATUS_REL.VERDE.cor : COR.vermelho) } }
  l += 1
  res.getCell(l, 1).value = `Gerado em ${m.geradoEmTexto} por ${m.usuario}. ${m.regraSemaforo}.`
  res.getCell(l, 1).font = { italic: true, color: { argb: ARGB(COR.neutro) } }
  l += 2
  l = titulo(res, l, 'Mensagens-chave', 12)
  d.mensagens.forEach((msg, k) => { res.getCell(l, 1).value = `${k + 1}. ${msg}`; res.getCell(l, 1).alignment = { wrapText: false }; l += 1 })
  l += 1
  l = titulo(res, l, 'Semáforo dos indicadores essenciais', 12)
  l = adicionarTabela(res, l, 'Semaforo', [{ titulo: 'Situação' }, { titulo: 'Quantidade', formato: '#,##0' }], [
    ['✓ Na meta', d.semaforo.verde], ['! Atenção', d.semaforo.amarelo], ['▲ Fora da meta', d.semaforo.vermelho],
    ['– Sem meta homologada', d.semaforo.semMeta], ['? Não se aplica / sem dado', d.semaforo.na],
  ])
  l = titulo(res, l, 'Indicadores essenciais do mês', 12)
  const cabResumo = l
  const essenciais = d.indicadores.filter((i) => i.classe === 'ESSENCIAL')
  l = adicionarTabela(res, l, 'Resumo', [
    { titulo: 'Indicador', largura: 44 }, { titulo: 'Área', largura: 26 }, { titulo: 'Realizado' }, { titulo: 'Realizado (texto)' },
    { titulo: 'Meta', largura: 18 }, { titulo: 'Status', largura: 22 }, { titulo: 'Mês anterior' }, { titulo: 'Variação', largura: 22 },
    { titulo: 'Acumulado ano' }, { titulo: 'Tendência', largura: 26 },
  ], essenciais.map((i) => [i.nome, i.areaNome, r6(i.mes.valor), i.mes.texto, i.mes.metaTexto, statusTexto(i.mes), r6(i.mes.valorAnterior), i.mes.variacaoTexto, r6(i.ano.valor), i.tendenciaTexto]))
  essenciais.forEach((i, k) => {
    const f = formatoNumeroExcel(i.unidade, i.casas)
    for (const c of [3, 7, 9]) res.getCell(cabResumo + 1 + k, c).numFmt = f
    const st = STATUS_REL[i.mes.status]
    res.getCell(cabResumo + 1 + k, 6).font = { bold: true, color: { argb: ARGB(st.cor) } }
  })
  res.getColumn(1).width = 60
  res.views = [{ state: 'frozen', ySplit: 1 }]

  /* ---------------- uma aba por área */
  for (const a of AREAS.filter((x) => m.areas.includes(x.codigo))) {
    const ws = wb.addWorksheet(a.nome.slice(0, 31))
    let r = titulo(ws, 1, `${a.nome} — ${m.competenciaRotulo}`)
    r += 1
    const inds = d.indicadores.filter((i) => i.area === a.codigo)
    const cab = r
    r = adicionarTabela(ws, r, `Ind_${a.codigo}`, [
      { titulo: 'Código', largura: 26 }, { titulo: 'Indicador', largura: 42 }, { titulo: 'Classe' }, { titulo: 'Unidade' },
      { titulo: 'Mês' }, { titulo: 'Meta (mês)', largura: 18 }, { titulo: 'Status (mês)', largura: 22 }, { titulo: 'Mês anterior' },
      { titulo: 'Variação', largura: 22 }, { titulo: 'Trimestre' }, { titulo: 'Semestre' }, { titulo: 'Ano' }, { titulo: 'Tendência', largura: 26 },
      { titulo: 'Comentário executivo', largura: 50 },
    ], inds.map((i) => [i.codigo, i.nome, i.classe, i.unidade, r6(i.mes.valor), i.mes.metaTexto, statusTexto(i.mes), r6(i.mes.valorAnterior), i.mes.variacaoTexto,
      r6(i.trimestre.valor), r6(i.semestre.valor), r6(i.ano.valor), i.tendenciaTexto, i.comentarios.map((c) => `${c.tipo}: ${c.texto}`).join(' | ') || null]))
    inds.forEach((i, k) => { const f = formatoNumeroExcel(i.unidade, i.casas); for (const c of [5, 8, 10, 11, 12]) ws.getCell(cab + 1 + k, c).numFmt = f })
    ws.views = [{ state: 'frozen', ySplit: cab }]
    if (inds.length) {
      r = titulo(ws, r, 'Evolução mensal (valores do mês)', 12)
      const meses = inds[0].evolucao.map((p) => p.rotulo)
      const cabEv = r
      r = adicionarTabela(ws, r, `Evol_${a.codigo}`, [{ titulo: 'Indicador', largura: 42 }, ...meses.map((x) => ({ titulo: x }))],
        inds.map((i) => [i.nome, ...i.evolucao.map((p) => r6(p.valor))]))
      inds.forEach((i, k) => { const f = formatoNumeroExcel(i.unidade, i.casas); for (let c = 2; c <= meses.length + 1; c++) ws.getCell(cabEv + 1 + k, c).numFmt = f })
    }
    const secoes = SECOES.filter((s) => s.area === a.codigo).map((s) => s.id)
    for (const q of d.quebras.filter((x) => secoes.includes(x.secao))) {
      r = titulo(ws, r, `${q.titulo} (fonte: ${q.fonte})`, 12)
      const fq = q.unidade === 'R$' ? '"R$" #,##0.00' : '#,##0'
      r = adicionarTabela(ws, r, `Q_${q.id}`, [{ titulo: q.dimensaoRotulo, largura: 32 }, ...q.rotulosMeses.map((x) => ({ titulo: x, formato: fq })),
        { titulo: 'Participação no mês (%)', formato: '0.0"%"' }, { titulo: 'Acumulado (%)', formato: '0.0"%"' }],
      [...q.itens.map((i) => [i.dimensao, ...i.valores, r6(i.participacao), r6(i.acumulado)]), ['Total do mês', ...q.totais, null, null]])
    }
    for (const t of d.tabelasExtras.filter((x) => secoes.includes(x.secao))) {
      r = titulo(ws, r, t.titulo, 12)
      r = adicionarTabela(ws, r, `T_${t.id}`, t.colunas.map((c) => ({ titulo: c })), t.linhas)
    }
  }

  /* ---------------- Indicadores (todos os períodos) */
  const wi = wb.addWorksheet('Indicadores')
  const rotuloPeriodo = { MES: 'Mês', TRIMESTRE: 'Trimestre', SEMESTRE: 'Semestre', ANO: 'Ano' } as const
  const linhasInd: unknown[][] = []
  const formatos: string[] = []
  for (const i of d.indicadores) {
    for (const p of [i.mes, i.trimestre, i.semestre, i.ano]) {
      linhasInd.push([i.codigo, i.nome, i.areaNome, i.classe, rotuloPeriodo[p.escopo], p.rotulo, i.formula, i.consolidacao, i.unidade,
        r6(p.valor), p.texto, r6(p.alvo), p.metaTexto, `${STATUS_REL[p.status].simbolo} ${STATUS_REL[p.status].texto}`, r6(p.valorAnterior), p.variacaoTexto,
        p.fonte, p.situacao === 'OK' ? 'Completo' : p.situacao === 'NAO_APLICAVEL' ? 'Não se aplica' : 'Não informado', p.motivo, p.regra, dataHoraExcel(p.calculadoEm)])
      formatos.push(formatoNumeroExcel(i.unidade, i.casas))
    }
  }
  adicionarTabela(wi, 1, 'Indicadores', [
    { titulo: 'Código', largura: 28 }, { titulo: 'Indicador', largura: 42 }, { titulo: 'Área', largura: 24 }, { titulo: 'Classe' },
    { titulo: 'Período' }, { titulo: 'Referência' }, { titulo: 'Fórmula', largura: 50 }, { titulo: 'Consolidação', largura: 18 }, { titulo: 'Unidade' },
    { titulo: 'Realizado' }, { titulo: 'Realizado (texto)', largura: 18 }, { titulo: 'Alvo' }, { titulo: 'Meta', largura: 20 }, { titulo: 'Status', largura: 22 },
    { titulo: 'Valor anterior' }, { titulo: 'Variação', largura: 22 }, { titulo: 'Fonte' }, { titulo: 'Situação do dado', largura: 16 }, { titulo: 'Motivo', largura: 40 },
    { titulo: 'Regra de consolidação', largura: 50 }, { titulo: 'Calculado em', largura: 18, formato: 'dd/mm/yyyy hh:mm' },
  ], linhasInd)
  formatos.forEach((f, k) => { for (const c of [10, 12, 15]) wi.getCell(2 + k, c).numFmt = f })
  wi.views = [{ state: 'frozen', ySplit: 1 }]

  /* ---------------- detalhes (conforme permissão) */
  for (const t of d.detalhes) detalhe(wb, t)

  /* ---------------- Planos de Ação */
  const wp = wb.addWorksheet('Planos de Ação')
  adicionarTabela(wp, 1, 'Planos', [
    { titulo: 'Código' }, { titulo: 'Área', largura: 24 }, { titulo: 'Indicador / ocorrência', largura: 40 }, { titulo: 'Ação', largura: 60 },
    { titulo: 'Responsável', largura: 24 }, { titulo: 'Início', formato: 'dd/mm/yyyy' }, { titulo: 'Prazo', formato: 'dd/mm/yyyy' },
    { titulo: 'Status', largura: 20 }, { titulo: 'Criticidade' }, { titulo: 'Vencida' }, { titulo: 'Competência de origem', formato: 'mm/yyyy' },
  ], d.planos.map((p) => [p.codigo, p.areaNome, p.indicador, p.acao, p.responsavel, dataExcel(p.inicio), dataExcel(p.prazo), p.statusRotulo, p.criticidade,
    p.vencida ? 'Sim' : 'Não', dataExcel(p.competenciaOrigem)]))
  wp.views = [{ state: 'frozen', ySplit: 1 }]

  /* ---------------- Metas do próximo ciclo (quando houver) */
  if (d.metas.length) {
    const wm = wb.addWorksheet('Metas próximo ciclo')
    adicionarTabela(wm, 1, 'Metas', [{ titulo: 'Indicador', largura: 42 }, { titulo: 'Área', largura: 24 }, { titulo: 'Ciclo' }, { titulo: 'Meta', largura: 40 },
      { titulo: 'Situação', largura: 28 }, { titulo: 'Vigência', largura: 26 }, { titulo: 'Fonte', largura: 50 }, { titulo: 'Motivo', largura: 50 }],
    d.metas.map((x) => [x.indicador, x.areaNome, x.ciclo, x.descricao, x.situacaoRotulo, x.vigencia, x.fonte, x.motivo]))
    wm.views = [{ state: 'frozen', ySplit: 1 }]
  }

  /* ---------------- Metadados */
  const wmd = wb.addWorksheet('Metadados')
  adicionarTabela(wmd, 1, 'Metadados', [{ titulo: 'Item', largura: 30 }, { titulo: 'Valor', largura: 100 }], [
    ['Período (competência)', m.competenciaRotulo], ['Escopo', m.escopoRotulo], ['Modo', m.modoRotulo],
    ['Versão', `v${String(m.versao ?? 0).padStart(2, '0')}`], ...m.filtros.map((f) => [`Filtro — ${f.rotulo}`, f.valor]),
    ['Gerado em (Brasília)', m.geradoEmTexto], ['Gerado por', m.usuario], ['Selo', m.selo],
    ['Áreas pendentes de aprovação', m.pendentesRotulo.join(', ') || 'Nenhuma'],
    ...m.fechamento.map((f) => [`Fechamento — ${f.areaNome}`, f.statusRotulo]),
    ['Hash dos dados (SHA-256)', d.hash], ['Fonte dos dados', m.fonteDados], ['Regra do semáforo', m.regraSemaforo],
    ['Privacidade', `Sem e-mails, telefones, IPs ou nomes de solicitantes.${m.anonimizarNomes ? ' Técnicos por iniciais.' : ''}`],
    ['Observação', 'Valores exportados (sem fórmulas). Ausência de dado = "Não informado", nunca zero.'],
  ])
  wmd.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

function detalhe(wb: ExcelJS.Workbook, t: DetalheTabela) {
  const ws = wb.addWorksheet(t.aba.slice(0, 31))
  const fmt: Record<string, string | undefined> = { inteiro: '#,##0', decimal: '#,##0.00', moeda: '"R$" #,##0.00', data: 'dd/mm/yyyy', dataHora: 'dd/mm/yyyy hh:mm', percentual: '0.0"%"' }
  const linhas = t.linhas.map((l) => t.colunas.map((c) => {
    const v = l[c.chave]
    if (v === null || v === undefined) return null
    if (c.tipo === 'data') return dataExcel(v)
    if (c.tipo === 'dataHora') return dataHoraExcel(v)
    if (c.tipo === 'booleano') return v ? 'Sim' : 'Não'
    if (['inteiro', 'decimal', 'moeda', 'percentual'].includes(c.tipo)) return typeof v === 'number' ? v : Number(v)
    return String(v)
  }))
  adicionarTabela(ws, 1, `D_${t.aba}`, t.colunas.map((c) => ({ titulo: c.titulo, largura: c.largura ?? (c.tipo === 'dataHora' ? 17 : undefined), formato: fmt[c.tipo] })), linhas)
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}
