import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { gerarXlsx } from '@/lib/relatorios/xlsx'
import { dadosFicticios } from '../fixtures/relatorios-dados'

describe('relatórios — Excel', () => {
  it('tem as abas esperadas, tabelas com filtro e nenhum e-mail', async () => {
    const d = dadosFicticios()
    const buf = await gerarXlsx(d)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const abas = wb.worksheets.map((w) => w.name)
    expect(abas[0]).toBe('Resumo Executivo')
    for (const a of ['Indicadores', 'Planos de Ação', 'Metadados', 'Dados - Chamados TI', 'Tecnologia da Informação', 'Comodato']) expect(abas).toContain(a)
    const ind = wb.getWorksheet('Indicadores')!
    expect(ind.getRow(1).getCell(1).value).toBe('Código')
    expect(ind.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ind.getCell(2, 10).numFmt).toBe('0.0"%"')
    const zip = await JSZip.loadAsync(buf)
    for (const n of Object.keys(zip.files).filter((x) => x.startsWith('xl/') && x.endsWith('.xml'))) {
      const xml = await zip.file(n)!.async('string')
      expect(xml, n).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    }
    expect(Object.keys(zip.files).some((n) => n.startsWith('xl/tables/'))).toBe(true)
  })
})
