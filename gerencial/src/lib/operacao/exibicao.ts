import { data, dataHora, moeda, numero, NAO_INFORMADO } from '@/lib/format'
import type { TipoCampo } from './tipos'

/** Formatação pt-BR de um valor de campo para telas (ausente = "Não informado"). */
export function exibirValor(c: { tipo: TipoCampo; rotulosOpcoes?: Record<string, string> }, v: unknown, rotuloRef?: string): string {
  if (v === null || v === undefined || v === '') return NAO_INFORMADO
  switch (c.tipo) {
    case 'data':
      return data(String(v))
    case 'dataHora':
      return dataHora(v as Date)
    case 'competencia': {
      const s = String(v)
      return `${s.slice(5, 7)}/${s.slice(0, 4)}`
    }
    case 'moeda':
      return moeda(Number(v))
    case 'decimal':
      return numero(Number(v), Number.isInteger(Number(v)) ? 0 : 2)
    case 'inteiro':
      return numero(Number(v), 0)
    case 'bool':
    case 'boolNulo':
      return v ? 'Sim' : 'Não'
    case 'enum':
      return c.rotulosOpcoes?.[String(v)] ?? String(v)
    case 'ref':
      return rotuloRef ?? `#${v}`
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v)
    default:
      return String(v)
  }
}

/** Valor para CSV pt-BR: vazio quando ausente (nunca zero), vírgula decimal, datas dd/mm/aaaa. */
export function valorCsv(c: { tipo: TipoCampo; rotulosOpcoes?: Record<string, string> }, v: unknown, rotuloRef?: string): string {
  if (v === null || v === undefined || v === '') return ''
  if (c.tipo === 'moeda' || c.tipo === 'decimal' || c.tipo === 'inteiro') return String(v).replace('.', ',')
  if (c.tipo === 'dataHora') return exibirValor(c, v).replace(', ', ' ')
  return exibirValor(c, v, rotuloRef)
}

/** Linha CSV com separador ';' e aspas quando necessário. */
export function linhaCsv(valores: string[]): string {
  return valores.map((v) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(';')
}
