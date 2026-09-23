import { describe, expect, it } from 'vitest'
import { esc, iniciais, nomeArquivo, sanitizarTexto } from '@/lib/relatorios/nomes'

describe('relatórios — nomes de arquivo', () => {
  it('segue o padrão oficial por formato', () => {
    expect(nomeArquivo('XLSX', 'CONSOLIDADO', '2026-07-01', 1)).toBe('Costa_Lavos_Relatorio_Executivo_2026-07_v01.xlsx')
    expect(nomeArquivo('PDF_A4', 'CONSOLIDADO', '2026-07-01', 12)).toBe('Costa_Lavos_Relatorio_Executivo_2026-07_v12.pdf')
    expect(nomeArquivo('PPTX', 'CONSOLIDADO', '2026-07-01', 3)).toBe('Costa_Lavos_Apresentacao_Diretoria_2026-07_v03.pptx')
    expect(nomeArquivo('PDF_APRESENTACAO', 'CONSOLIDADO', '2026-07-01', 3)).toBe('Costa_Lavos_Apresentacao_Diretoria_2026-07_v03.pdf')
  })
  it('acrescenta o escopo isolado antes da versão', () => {
    expect(nomeArquivo('PPTX', 'TI', '2026-07-01', 2)).toBe('Costa_Lavos_Apresentacao_Diretoria_2026-07_TI_v02.pptx')
    expect(nomeArquivo('XLSX', 'COMODATO_MANUTENCAO', '2026-01-01', 1)).toBe('Costa_Lavos_Relatorio_Executivo_2026-01_Comodato_Manutencao_v01.xlsx')
  })
})

describe('relatórios — texto seguro', () => {
  it('escapa HTML', () => {
    expect(esc(`<script>alert("x")</script> & 'a'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;a&#39;')
    expect(esc(null)).toBe('')
  })
  it('remove e-mails, telefones e IPs de textos livres', () => {
    const s = sanitizarTexto('Falar com ana.silva@cliente.com.br ou (11) 98765-4321, IP 10.0.0.12')!
    expect(s).not.toMatch(/@/)
    expect(s).not.toContain('98765')
    expect(s).not.toContain('10.0.0.12')
    expect(sanitizarTexto(null)).toBeNull()
  })
  it('gera iniciais ignorando partículas', () => {
    expect(iniciais('João da Silva')).toBe('J. S.')
    expect(iniciais('Epifanio')).toBe('E.')
  })
})
