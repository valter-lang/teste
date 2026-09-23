/** Tipos compartilhados entre servidor e componentes de cliente (sem dependências de servidor). */
import type { Entrada } from '@/lib/validacao/comum'
export type { Entrada }

export type TipoCampo =
  | 'texto' | 'textoLongo' | 'inteiro' | 'decimal' | 'moeda' | 'data' | 'dataHora' | 'competencia'
  | 'bool' | 'boolNulo' | 'enum' | 'ref' | 'tags' | 'email'

export interface Opcao {
  valor: string
  rotulo: string
  inativo?: boolean
}

/** Campo serializável enviado aos componentes de cliente. */
export interface CampoCliente {
  nome: string
  rotulo: string
  tipo: TipoCampo
  obrigatorio?: boolean
  ajuda?: string
  opcoes?: Opcao[]
  largo?: boolean
  grupo?: string
  somenteLeitura?: boolean
}

/** Regra de interface: quando `campo` = `valor`, força `definir` = `para` (o servidor aplica a mesma regra). */
export interface RegraUi {
  campo: string
  valor: string
  definir: string
  para: string
  aviso: string
}

export interface EstadoForm {
  ok?: string
  erro?: string
  erros?: Record<string, string>
  valores?: Entrada
  versao?: number | null
  seq?: number
}

export interface ResultadoLinha {
  ok: boolean
  id?: number
  versao?: number | null
  erro?: string
  erros?: Record<string, string>
  valores?: Entrada
}

export interface ResultadoColagem {
  gravadas: number
  ids: number[]
  erros: { linha: number; mensagem: string }[]
  erroGeral?: string
}

/** Linha do editor de peças (valores em texto). */
export interface LinhaPecaEntrada {
  id?: string
  familia_id: string
  item_peca_id: string
  local_estoque_id: string
  quantidade: string
  valor_total: string
}

/** Cálculos de grade conhecidos pelo cliente (funções não atravessam a fronteira servidor/cliente). */
export type CalculoGrade = 'conciliacao_posicao'
