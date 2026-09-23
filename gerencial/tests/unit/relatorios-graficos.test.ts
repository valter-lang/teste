import { describe, expect, it } from 'vitest'
import { svgColunas, svgPareto, svgLinha } from '@/lib/relatorios/graficos'

describe('relatórios — gráficos SVG', () => {
  it('desenha colunas com rótulos, meta dourada e escapa categorias', () => {
    const svg = svgColunas({
      categorias: ['jan/26', '<b>fev</b>', 'mar/26'], series: [{ nome: 'S', valores: [10, null, 30], cor: 'C9C5C1' }],
      coresPorPonto: ['C9C5C1', 'C9C5C1', 'A41E22'], meta: { valor: 25, rotulo: 'Meta ≥ 25' }, largura: 400, altura: 200, formatar: (v) => String(v),
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('&lt;b&gt;fev&lt;/b&gt;')
    expect(svg).not.toContain('<b>')
    expect((svg.match(/<rect /g) ?? []).length).toBe(2)
    expect(svg).toContain('#A41E22')
    expect(svg).toContain('#D6B46C')
    expect(svg).toContain('n/i')
    expect(svg).toContain('>30<')
  })
  it('desenha pareto com referência de 80% e acumulado', () => {
    const svg = svgPareto({ itens: [{ rotulo: 'A', valor: 8, acumulado: 80, classeA: true }, { rotulo: 'B', valor: 2, acumulado: 100, classeA: false }], largura: 400, altura: 200, formatar: String })
    expect(svg).toContain('80%')
    expect(svg).toContain('<polyline')
  })
  it('desenha linha com segmentos interrompidos em meses sem dado', () => {
    const svg = svgLinha({ categorias: ['a', 'b', 'c', 'd'], valores: [1, 2, null, 4], largura: 300, altura: 150, formatar: String })
    expect((svg.match(/<polyline/g) ?? []).length).toBe(1)
    expect((svg.match(/<circle/g) ?? []).length).toBe(3)
  })
})
