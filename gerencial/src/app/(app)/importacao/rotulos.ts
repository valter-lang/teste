import type { StatusImportacao } from '@/lib/importacao/consultas'

export const ROTULO_STATUS: Record<StatusImportacao, { texto: string; tom: 'neutro' | 'dourado' | 'ok' | 'critico' | 'atencao' }> = {
  ANALISADA: { texto: 'Analisada', tom: 'atencao' },
  GRAVADA: { texto: 'Gravada', tom: 'dourado' },
  HOMOLOGADA: { texto: 'Homologada', tom: 'ok' },
  DESCARTADA: { texto: 'Descartada', tom: 'neutro' },
}

export const ROTULO_PENDENCIA: Record<string, string> = {
  SEM_MAPEAMENTO: 'Sem mapeamento',
  VALOR_INVALIDO: 'Valor inválido',
  FORMULA_INVALIDA: 'Fórmula inválida',
  DUPLICIDADE: 'Duplicidade',
  TOTAL_INCOMPATIVEL: 'Total incompatível',
  DADO_TESTE: 'Dado de teste',
  CONCILIACAO: 'Conciliação',
  DIVERGENCIA_FONTE: 'Divergência de fonte',
  INFORMATIVO: 'Informativo',
}
