import { Tabela, Th, Td } from './ui'

/** Visão em tabela de um gráfico (acessibilidade e conferência). */
export function TabelaDados({ colunas, linhas, resumo = 'Ver dados em tabela' }: { colunas: string[]; linhas: (string | number)[][]; resumo?: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-vinho">{resumo}</summary>
      <Tabela className="mt-2">
        <thead><tr>{colunas.map((c, i) => <Th key={c} alinhar={i ? 'direita' : 'esquerda'}>{c}</Th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((v, j) => <Td key={j} alinhar={j ? 'direita' : 'esquerda'}>{v}</Td>)}</tr>)}</tbody>
      </Tabela>
    </details>
  )
}
