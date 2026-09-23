/**
 * Geração ponta a ponta pela fila (Excel, PDF A4, PDF 16:9 e PowerPoint) sobre dados de
 * teste de maio–julho/2026: os MESMOS valores do motor (painel) aparecem no snapshot e em
 * todos os arquivos — sem diferença silenciosa entre dashboard e exportações.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { pool, q, q1 } from '@/lib/db'
import { calcularPainel } from '@/lib/indicadores/motor'
import { montarDadosRelatorio } from '@/lib/relatorios/dados'
import { carregarUsuarioRelatorio, processarProximo, solicitarRelatorio, type JobRelatorio } from '@/lib/relatorios/fila'
import type { DadosRelatorio, FormatoRelatorio, UsuarioRelatorio } from '@/lib/relatorios/tipos'
import { COMPETENCIA_FIXTURE, EMAIL_PROIBIDO, criarFixture, type Fixture } from '../fixtures/relatorios-fixture'

const dir = mkdtempSync(join(tmpdir(), 'rel-teste-'))
let fx: Fixture
let usuario: UsuarioRelatorio
const jobs: number[] = []
const arquivos: Record<string, Buffer> = {}
let snapshot: DadosRelatorio

const norm = (s: string) => s.replace(/\s+/g, '')

async function gerar(formato: FormatoRelatorio, escopo: 'CONSOLIDADO' | 'TI' | 'COMODATO_MANUTENCAO' = 'CONSOLIDADO'): Promise<JobRelatorio & { conteudo: Buffer }> {
  const id = await solicitarRelatorio({ competencia: COMPETENCIA_FIXTURE, escopo, modo: 'EXECUTIVO', formato }, usuario)
  jobs.push(id)
  let j: JobRelatorio | null = null
  for (let i = 0; i < 5; i++) {
    j = await processarProximo()
    if (j?.id === id && (j.status === 'CONCLUIDO' || j.status === 'ERRO')) break
  }
  const final = (await q1<JobRelatorio>(`select id, status, versao, arquivo_id, arquivo_nome, situacao_fechamento, hash_dados, mensagem_erro, progresso from relatorio_job where id = $1`, [id]))!
  expect(final.mensagem_erro).toBeNull()
  expect(final.status).toBe('CONCLUIDO')
  expect(final.progresso).toBe(100)
  const a = (await q1<{ conteudo: Buffer; sha256: string; categoria: string }>(`select conteudo, sha256, categoria from arquivo where id = $1`, [final.arquivo_id]))!
  expect(a.categoria).toBe('RELATORIO')
  return { ...final, conteudo: a.conteudo }
}

function textoPdf(buf: Buffer): string {
  const f = join(dir, `x-${Date.now()}.pdf`)
  writeFileSync(f, buf)
  return execFileSync('python3', ['-c', `import pypdfium2 as p,sys\nd=p.PdfDocument(sys.argv[1])\nprint('\\n'.join(d[i].get_textpage().get_text_range() for i in range(len(d))))`, f], { encoding: 'utf8', maxBuffer: 50e6 })
}

async function textoZip(buf: Buffer, filtro: RegExp): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const partes = await Promise.all(Object.keys(zip.files).filter((n) => filtro.test(n)).map((n) => zip.file(n)!.async('string')))
  return partes.join('\n')
}

beforeAll(async () => {
  await q(`delete from relatorio_job where competencia = $1`, [COMPETENCIA_FIXTURE])
  fx = await criarFixture(pool())
  await fx.definirFechamento('RASCUNHO', ['MANUT_INTERNA', 'TI'])
  usuario = (await carregarUsuarioRelatorio(fx.adminId))!
})

afterAll(async () => {
  if (jobs.length) {
    const arq = await q<{ arquivo_id: string | null }>(`select arquivo_id from relatorio_job where id = any($1)`, [jobs])
    await q(`delete from relatorio_job where id = any($1)`, [jobs])
    await q(`delete from arquivo where id = any($1::uuid[])`, [arq.map((a) => a.arquivo_id).filter(Boolean)])
  }
  await fx?.limpar()
  await pool().end()
})

describe('central de relatórios — geração pela fila', () => {
  it('gera os quatro formatos com nomes, versões e selo PRELIMINAR', async () => {
    for (const f of ['XLSX', 'PPTX', 'PDF_A4', 'PDF_APRESENTACAO'] as const) {
      const j = await gerar(f)
      expect(j.versao).toBe(1)
      expect(j.situacao_fechamento).toBe('PRELIMINAR')
      expect(j.hash_dados).toMatch(/^[0-9a-f]{64}$/)
      arquivos[f] = j.conteudo
    }
    expect(Object.keys(arquivos)).toHaveLength(4)
    const nomes = await q<{ arquivo_nome: string }>(`select arquivo_nome from relatorio_job where id = any($1) order by id`, [jobs])
    expect(nomes.map((n) => n.arquivo_nome)).toEqual([
      'Costa_Lavos_Relatorio_Executivo_2026-07_v01.xlsx', 'Costa_Lavos_Apresentacao_Diretoria_2026-07_v01.pptx',
      'Costa_Lavos_Relatorio_Executivo_2026-07_v01.pdf', 'Costa_Lavos_Apresentacao_Diretoria_2026-07_v01.pdf',
    ])
    const ev = await q1<{ n: number }>(`select count(*)::int n from evento_sistema where tipo = 'EXPORTACAO_RELATORIO' and (detalhes->>'job_id')::int = any($1)`, [jobs])
    expect(ev!.n).toBeGreaterThanOrEqual(4)
  }, 180_000)

  it('snapshot = painel: mesmos valores do motor e hash reproduzível', async () => {
    snapshot = await montarDadosRelatorio({ competencia: COMPETENCIA_FIXTURE, escopo: 'CONSOLIDADO', modo: 'EXECUTIVO', usuario })
    const painel = await calcularPainel(COMPETENCIA_FIXTURE, 'MES', { codigos: snapshot.indicadores.map((i) => i.codigo) })
    expect(painel.length).toBe(snapshot.indicadores.length)
    for (const r of painel) {
      const i = snapshot.indicadores.find((x) => x.codigo === r.codigo)!
      expect(i.mes.valor, r.codigo).toBe(r.valor)
      expect(i.mes.status, r.codigo).toBe(r.status)
    }
    expect(snapshot.indicadores.filter((i) => i.mes.valor !== null).length).toBeGreaterThan(5)
    const pptx = await q1<{ hash_dados: string }>(`select hash_dados from relatorio_job where id = $1`, [jobs[1]])
    expect(pptx!.hash_dados).toBe(snapshot.hash)
    expect(snapshot.metadados.selo).toBe('PRELIMINAR')
    expect([...snapshot.metadados.pendentes].sort()).toEqual(['COMODATO', 'ESTOQUE_PECAS', 'MANUT_EXTERNA', 'MANUT_INTERNA', 'TI'])
  }, 120_000)

  it('Excel: aba Indicadores traz os mesmos valores do snapshot', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(arquivos.XLSX as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Indicadores')!
    const porCodigo = new Map<string, { valor: unknown; texto: unknown }>()
    ws.eachRow((row, n) => { if (n > 1 && row.getCell(5).value === 'Mês') porCodigo.set(String(row.getCell(1).value), { valor: row.getCell(10).value, texto: row.getCell(11).value }) })
    for (const i of snapshot.indicadores) {
      const l = porCodigo.get(i.codigo)
      expect(l, i.codigo).toBeDefined()
      expect(l!.texto, i.codigo).toBe(i.mes.texto)
      if (i.mes.valor === null) expect(l!.valor).toBeNull()
      else expect(Number(l!.valor)).toBeCloseTo(i.mes.valor, 6)
    }
    expect(wb.getWorksheet('Dados - Chamados externos')).toBeDefined()
    expect(wb.getWorksheet('Dados - Historico migrado')).toBeDefined()
    const xml = await textoZip(arquivos.XLSX, /^xl\/.*\.xml$/)
    expect(xml).not.toContain(EMAIL_PROIBIDO)
    expect(xml).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    expect(xml).not.toContain('Maria Contato')
    expect(xml).not.toContain('Joana Solicitante')
    expect(xml).not.toContain('98765-4321')
  })

  it('PowerPoint: mesmos números, gráficos nativos (<c:chart>) e tabelas editáveis (a:tbl)', async () => {
    const zip = await JSZip.loadAsync(arquivos.PPTX)
    const slidesXml = await textoZip(arquivos.PPTX, /^ppt\/slides\/slide\d+\.xml$/)
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))
    expect(charts.length).toBeGreaterThan(3)
    expect(await zip.file(charts[0])!.async('string')).toContain('<c:chart>')
    expect(slidesXml).toContain('<a:tbl>')
    const textos = [...slidesXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join('\n')
    for (const i of snapshot.indicadores) expect(textos, i.codigo).toContain(i.mes.texto)
    expect(textos).toContain('PRELIMINAR')
    const tudo = await textoZip(arquivos.PPTX, /\.xml$/)
    expect(tudo).not.toContain(EMAIL_PROIBIDO)
    expect(tudo).not.toContain('Maria Contato')
  })

  it('PDFs: mesmos números no relatório A4 e na apresentação 16:9', async () => {
    const a4 = norm(textoPdf(arquivos.PDF_A4))
    const deck = norm(textoPdf(arquivos.PDF_APRESENTACAO))
    for (const i of snapshot.indicadores) {
      expect(a4, i.codigo).toContain(norm(i.mes.texto))
      expect(deck, i.codigo).toContain(norm(i.mes.texto))
    }
    expect(a4).toContain(norm('Confidencial — uso interno'))
    expect(a4).toMatch(/Página1\/\d+/)
    expect(a4).toContain('PRELIMINAR')
    expect(a4).not.toContain(norm(EMAIL_PROIBIDO))
    expect(deck).not.toContain(norm(EMAIL_PROIBIDO))
  }, 60_000)

  it('selo OFICIAL com todas as áreas aprovadas; nova versão sequencial', async () => {
    await fx.definirFechamento('APROVADO')
    const j = await gerar('XLSX')
    expect(j.situacao_fechamento).toBe('OFICIAL')
    expect(j.versao).toBe(2)
    expect(j.arquivo_nome).toBe('Costa_Lavos_Relatorio_Executivo_2026-07_v02.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(j.conteudo as unknown as ArrayBuffer)
    const vals: unknown[] = []
    wb.getWorksheet('Metadados')!.eachRow((r) => vals.push(r.getCell(2).value))
    expect(vals).toContain('OFICIAL')
  }, 120_000)

  it('deck isolado de TI tem 11 slides e versões concorrentes não colidem', async () => {
    const ids = [
      await solicitarRelatorio({ competencia: COMPETENCIA_FIXTURE, escopo: 'TI', modo: 'EXECUTIVO', formato: 'PPTX' }, usuario),
      await solicitarRelatorio({ competencia: COMPETENCIA_FIXTURE, escopo: 'TI', modo: 'EXECUTIVO', formato: 'PPTX' }, usuario),
    ]
    jobs.push(...ids)
    await Promise.all([processarProximo(), processarProximo()])
    const r = await q<{ versao: number; status: string; arquivo_id: string }>(`select versao, status, arquivo_id from relatorio_job where id = any($1) order by versao`, [ids])
    expect(r.map((x) => x.status)).toEqual(['CONCLUIDO', 'CONCLUIDO'])
    expect(r.map((x) => x.versao)).toEqual([1, 2])
    const a = (await q1<{ conteudo: Buffer }>(`select conteudo from arquivo where id = $1`, [r[0].arquivo_id]))!
    const zip = await JSZip.loadAsync(a.conteudo)
    expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(11)
  }, 120_000)
})
