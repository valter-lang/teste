/** Tipos do snapshot único consumido pelos três geradores (Excel, PDF e PowerPoint). */
import type { Escopo } from '@/lib/competencia'
import type { Status } from '@/lib/indicadores/status'
import type { Definicao } from '@/lib/indicadores/motor'
import type { AreaCodigo, Atribuicao } from '@/lib/auth/permissoes'
import type { Dimensao, SerieCodigo } from '@/lib/indicadores/series'
import type { FonteExportacao } from './estilo'

export type EscopoRelatorio = 'CONSOLIDADO' | 'COMODATO_MANUTENCAO' | 'TI'
export type ModoRelatorio = 'EXECUTIVO' | 'COMPLETO'
export type FormatoRelatorio = 'XLSX' | 'PDF_A4' | 'PDF_APRESENTACAO' | 'PPTX'
export type Selo = 'OFICIAL' | 'PRELIMINAR'

export type SecaoId =
  | 'MANUT_INTERNA' | 'MANUT_EXTERNA' | 'ESTOQUE_PECAS'
  | 'COMODATO_BASE' | 'COMODATO_ATENDIMENTO'
  | 'TI_OPERACAO' | 'TI_CONTINUIDADE'

export interface UsuarioRelatorio { id: string; nome: string; atribuicoes: Atribuicao[] }

export interface ValorPeriodo {
  escopo: Escopo
  rotulo: string
  periodoInicio: string
  periodoFim: string
  valor: number | null
  texto: string
  numerador: number | null
  denominador: number | null
  alvo: number | null
  metaTexto: string
  status: Status
  statusTexto: string
  valorAnterior: number | null
  anteriorTexto: string
  variacaoAbs: number | null
  variacaoPct: number | null
  variacaoTexto: string
  situacao: 'OK' | 'NAO_INFORMADO' | 'NAO_APLICAVEL'
  motivo: string | null
  fonte: string
  regra: string
  calculadoEm: string
}

export interface PontoEvolucao { competencia: string; rotulo: string; valor: number | null; texto: string; situacao: string }

export interface IndicadorRelatorio {
  codigo: string
  nome: string
  area: AreaCodigo
  areaNome: string
  secao: SecaoId
  classe: Definicao['classe']
  unidade: string
  casas: number
  direcao: Definicao['direcao']
  consolidacao: Definicao['consolidacao']
  formula: string
  descricao: string
  fonteRegra: string
  origemDados: string
  homologado: boolean
  pendencias: string | null
  mes: ValorPeriodo
  trimestre: ValorPeriodo
  semestre: ValorPeriodo
  ano: ValorPeriodo
  evolucao: PontoEvolucao[]
  tendencia: 'ALTA' | 'QUEDA' | 'ESTAVEL' | 'SEM_DADOS'
  tendenciaTexto: string
  comentarios: { tipo: string; texto: string }[]
}

export interface ItemQuebra {
  dimensao: string
  valores: number[]
  atual: number
  participacao: number
  acumulado: number
  classeA: boolean
}

export interface Quebra {
  id: string
  secao: SecaoId
  titulo: string
  serie: SerieCodigo
  dimensao: Dimensao | null
  dimensaoRotulo: string
  unidade: 'qtd' | 'R$'
  tipo: 'COMPARATIVO' | 'PARETO'
  meses: string[]
  rotulosMeses: string[]
  totais: (number | null)[]
  totaisTexto: string[]
  itens: ItemQuebra[]
  fonte: string
}

export interface TabelaExtra {
  id: string
  secao: SecaoId
  titulo: string
  colunas: string[]
  alinhamento: ('esquerda' | 'direita')[]
  linhas: string[][]
  fonte: string
}

export interface AnaliseRelatorio {
  id: number
  area: AreaCodigo
  areaNome: string
  tipo: 'DESTAQUE' | 'ATENCAO' | 'RISCO' | 'DEPENDENCIA' | 'EXPLICACAO_DESVIO' | 'DECISAO_SOLICITADA'
  tipoRotulo: string
  fato: string
  numero: string | null
  indicadorCodigo: string | null
  indicadorNome: string | null
  ocorrencia: string | null
  responsavel: string
  areaDependente: string | null
}

export interface PlanoRelatorio {
  codigo: string
  area: AreaCodigo
  areaNome: string
  indicadorCodigo: string | null
  indicador: string
  acao: string
  responsavel: string
  inicio: string
  prazo: string
  prazoTexto: string
  status: string
  statusRotulo: string
  criticidade: string
  vencida: boolean
  competenciaOrigem: string | null
}

export interface MetaProximoCiclo {
  indicadorCodigo: string
  indicador: string
  area: AreaCodigo
  areaNome: string
  ciclo: string
  descricao: string
  situacao: 'APROVADA' | 'PROPOSTA'
  situacaoRotulo: string
  vigencia: string
  fonte: string
  motivo: string
}

export interface FechamentoArea { area: AreaCodigo; areaNome: string; status: string; statusRotulo: string; noEscopo: boolean }

export interface DetalheTabela {
  aba: string
  area: AreaCodigo
  titulo: string
  colunas: { chave: string; titulo: string; tipo: 'texto' | 'inteiro' | 'decimal' | 'moeda' | 'data' | 'dataHora' | 'percentual' | 'booleano'; largura?: number }[]
  linhas: Record<string, string | number | boolean | null>[]
}

export interface MetadadosRelatorio {
  competencia: string
  competenciaRotulo: string
  competenciaCurta: string
  competenciaArquivo: string
  escopo: EscopoRelatorio
  escopoRotulo: string
  modo: ModoRelatorio
  modoRotulo: string
  areas: AreaCodigo[]
  unidades: number[] | null
  unidadesRotulo: string
  filtros: { rotulo: string; valor: string }[]
  geradoEm: string
  geradoEmTexto: string
  usuario: string
  selo: Selo
  pendentes: string[]
  pendentesRotulo: string[]
  fechamento: FechamentoArea[]
  regraSemaforo: string
  fonteExportacao: FonteExportacao
  anonimizarNomes: boolean
  logotipo: { mime: string; base64: string } | null
  fonteDados: string
  mesesTag: string
  versao: number | null
}

export interface DadosRelatorio {
  metadados: MetadadosRelatorio
  mensagens: string[]
  semaforo: { verde: number; amarelo: number; vermelho: number; semMeta: number; na: number; total: number }
  indicadores: IndicadorRelatorio[]
  quebras: Quebra[]
  tabelasExtras: TabelaExtra[]
  analises: AnaliseRelatorio[]
  planos: PlanoRelatorio[]
  metas: MetaProximoCiclo[]
  detalhes: DetalheTabela[]
  hash: string
}
