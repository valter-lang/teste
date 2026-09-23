import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { gerarPptx } from '@/lib/relatorios/pptx'
import { montarDeck } from '@/lib/relatorios/estrutura'
import { dadosFicticios } from '../fixtures/relatorios-dados'

async function slides(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf)
  const nomes = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const xml = await Promise.all(nomes.map((n) => zip.file(n)!.async('string')))
  return { zip, xml }
}
const textos = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])

describe('relatórios — PowerPoint editável', () => {
  for (const escopo of ['TI', 'COMODATO_MANUTENCAO'] as const) {
    it(`deck isolado ${escopo}: exatamente 11 slides (10 executivos + metas), sem slides vazios`, async () => {
      const d = dadosFicticios(escopo)
      expect(montarDeck(d).slides.length).toBe(11)
      const { xml } = await slides(await gerarPptx(d))
      expect(xml.length).toBe(11)
      for (const s of xml) {
        // além do rodapé (3 textos), cada slide tem conteúdo próprio
        expect(textos(s).filter((t) => !/Costa Lavos • Relatório|PRELIMINAR|OFICIAL|v03/.test(t)).length).toBeGreaterThan(2)
      }
      expect(textos(xml[10]).join(' ')).toContain('Metas do próximo ciclo')
    })
  }

  it('usa gráficos e tabelas nativos (nenhuma imagem de gráfico)', async () => {
    const d = dadosFicticios('CONSOLIDADO', 'COMPLETO')
    const { zip, xml } = await slides(await gerarPptx(d))
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))
    expect(charts.length).toBeGreaterThan(0)
    expect(await zip.file(charts[0])!.async('string')).toContain('<c:chart')
    expect(xml.some((s) => s.includes('<a:tbl>'))).toBe(true)
    expect(Object.keys(zip.files).some((n) => /^ppt\/media\/.*\.(png|jpe?g)$/.test(n))).toBe(false)
    const todos = xml.map((s) => textos(s).join(' ')).join(' ')
    expect(todos).toContain('Costa Lavos • Relatório Executivo • Julho/2026')
    expect(todos).toContain('97%')
    for (const s of xml) expect(textos(s).length).toBeGreaterThan(3)
  })
})
