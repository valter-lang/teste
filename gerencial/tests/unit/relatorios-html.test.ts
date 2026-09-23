import { describe, expect, it } from 'vitest'
import { htmlApresentacao, htmlRelatorioA4, secoesA4 } from '@/lib/relatorios/html'
import { dadosFicticios } from '../fixtures/relatorios-dados'

describe('relatórios — HTML dos PDFs', () => {
  it('escapa todo texto dinâmico no relatório A4 e na apresentação', () => {
    const d = dadosFicticios()
    for (const html of [htmlRelatorioA4(d), htmlApresentacao(d)]) {
      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    }
  })
  it('monta sumário numerado e uma seção por bloco', () => {
    const d = dadosFicticios()
    const s = secoesA4(d)
    expect(s[0].titulo).toMatch(/^1\. /)
    const html = htmlRelatorioA4(d, Object.fromEntries(s.map((x, i) => [x.id, i + 3])))
    for (const x of s) expect(html).toContain(`data-bloco="${x.id}"`)
    expect(html).toContain('class="p">3<')
  })
  it('apresentação 16:9 tem uma página de 1280×720 por slide', () => {
    const html = htmlApresentacao(dadosFicticios('TI'))
    expect((html.match(/<section class="slide"/g) ?? []).length).toBe(11)
    expect(html).toContain('size:1280px 720px')
  })
})
