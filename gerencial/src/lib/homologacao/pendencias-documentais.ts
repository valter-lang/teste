/**
 * Pendências documentais identificadas na construção do sistema. Não dependem do banco:
 * registram lacunas entre a especificação, os documentos entregues e os dados disponíveis.
 */

export type ResponsavelSugerido = 'Diretoria' | 'Gestor Comodato' | 'Gestor TI' | 'Administrador'
export type StatusPendencia = 'ABERTA' | 'EM_ANALISE' | 'RESOLVIDA'

export interface PendenciaDocumental {
  id: string
  titulo: string
  descricao: string
  impacto: string
  responsavel: ResponsavelSugerido[]
  status: StatusPendencia
}

export const PENDENCIAS_DOCUMENTAIS: PendenciaDocumental[] = [
  {
    id: 'DOC-01',
    titulo: 'Padrões gerenciais de Comodato e TI não entregues',
    descricao: 'Os arquivos Padrao-Gerencial-Comodato.pptx e Padrao-Gerencial-TI.pptx não foram entregues. As regras dessas áreas foram transcritas da especificação e precisam ser conferidas com os originais.',
    impacto: 'Indicadores, fórmulas e metas de Comodato e TI podem divergir do padrão oficial até a conferência.',
    responsavel: ['Gestor Comodato', 'Gestor TI'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-02',
    titulo: 'Metas relativas do arquivo metas_marisa_urgente.pptx',
    descricao: 'O arquivo metas_marisa_urgente.pptx foi entregue (ao contrário da nota da especificação) e traz metas mensais relativas: Manutenção interna produtividade +15%; Manutenção externa reincidência −25% medida em quantidade; Comodato solicitações pendentes −15% (sem fonte de dados na planilha); TI "metas do TI" sem alvo numérico. Foram carregadas como PROPOSTA.',
    impacto: 'Sem aprovação da Diretoria, os indicadores dessas metas aparecem como "Sem meta homologada".',
    responsavel: ['Diretoria'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-03',
    titulo: 'Arquivo oficial do logotipo não fornecido',
    descricao: 'O arquivo oficial do logotipo não foi fornecido e www.costalavos.com.br estava inacessível no ambiente de construção. Foram usados os tokens de cor e tipografia da especificação; o sistema exibe apenas o nome em texto até o envio do arquivo oficial em Configurações › Identidade visual.',
    impacto: 'Telas e relatórios sem o logotipo oficial.',
    responsavel: ['Administrador'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-04',
    titulo: 'Estimativas de economia e perda sem fórmula homologada',
    descricao: 'A planilha e a apresentação de julho trazem "Economia gerada no 1º semestre" e "Perda com sucateamento", mas não há fórmula homologada para esses valores.',
    impacto: 'Esses valores não são exibidos no sistema até a definição e homologação da fórmula.',
    responsavel: ['Diretoria'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-05',
    titulo: 'Mascote da apresentação de julho',
    descricao: 'A apresentação de julho usa uma imagem de mascote. Ela não foi reproduzida no sistema nem nos relatórios sem aprovação formal de uso.',
    impacto: 'Relatórios exportados sem o mascote.',
    responsavel: ['Diretoria'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-06',
    titulo: 'Três volumes diferentes de manutenção externa em julho',
    descricao: 'Julho apresenta três volumes: 360 atendimentos por técnico, 417 chamados por equipamento e 372 chamados classificados como necessário/desnecessário. É preciso homologar qual definição é o volume oficial.',
    impacto: 'O volume e as taxas derivadas (reincidência, desnecessários) podem variar conforme a definição adotada.',
    responsavel: ['Diretoria'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-07',
    titulo: 'Regras operacionais pendentes',
    descricao: 'Homologar: expediente e horas úteis; janela de reincidência; elegibilidade de chamados ao SLA; linha de base da base ativa e do volume por equipamento; consumo mínimo por cliente.',
    impacto: 'SLA, reincidência, metas relativas e aderência ao consumo mínimo ficam marcados como pendentes.',
    responsavel: ['Diretoria', 'Gestor Comodato'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-08',
    titulo: 'Chamados de desenvolvimento (Linear/OPIVA) no SLA de TI',
    descricao: 'Definir se os chamados de desenvolvimento registrados no Linear/OPIVA entram no SLA e no MTTR de TI.',
    impacto: 'SLA e MTTR de TI podem mudar significativamente conforme a decisão.',
    responsavel: ['Gestor TI', 'Diretoria'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-09',
    titulo: 'Dados inexistentes na planilha',
    descricao: 'A planilha não contém base ativa, kg vendidos, tempos de primeira resposta, disponibilidade, backup nem projetos. Os indicadores dependentes exibem "Não informado" até que os dados sejam lançados ou integrados.',
    impacto: 'Indicadores sem valor histórico antes da data de corte.',
    responsavel: ['Gestor Comodato', 'Gestor TI', 'Administrador'],
    status: 'ABERTA',
  },
  {
    id: 'DOC-10',
    titulo: 'Outras unidades e feriados municipais',
    descricao: 'Somente a unidade Caieiras foi cadastrada. Confirmar se há outras unidades e cadastrar os feriados municipais de cada uma.',
    impacto: 'Horas úteis podem considerar como úteis dias de feriado municipal.',
    responsavel: ['Administrador'],
    status: 'ABERTA',
  },
]
