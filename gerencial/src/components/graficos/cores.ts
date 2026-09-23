/** Cores dos gráficos (identidade Costa Lavos): atual em vermelho, histórico em pedra, meta em dourado. */
export const COR = {
  atual: '#A41E22',
  principal: '#6A1025',
  historico: '#B4AEA9',
  historicoClaro: '#DDD8D3',
  meta: '#A7812F', // dourado escurecido para contraste da linha de referência (rótulo "Meta" sempre visível)
  grade: '#E6E1DC',
  texto: '#361319',
  textoSecundario: '#5F5A57',
}
export const fmtNum = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v)
