/**
 * Definições declarativas dos cadastros administrativos. Um único motor genérico
 * (servico.ts) lista, valida, grava e desativa qualquer cadastro descrito aqui.
 * Este arquivo não acessa o banco e pode ser importado por componentes cliente.
 */

export type TipoCampo = 'texto' | 'inteiro' | 'decimal' | 'booleano' | 'selecao' | 'referencia' | 'data' | 'uf'

export type ChaveReferencia =
  | 'empresa' | 'unidade' | 'rede' | 'cliente' | 'familia_equipamento' | 'modelo_equipamento' | 'familia_peca'

export interface Opcao { valor: string; rotulo: string }

export interface CampoDef {
  nome: string
  rotulo: string
  tipo: TipoCampo
  obrigatorio?: boolean
  /** Tamanho máximo (texto) */
  max?: number
  /** Valor mínimo (numéricos) */
  min?: number
  opcoes?: Opcao[]
  referencia?: ChaveReferencia
  ajuda?: string
  maiusculas?: boolean
  padrao?: string | boolean
}

export interface EntidadeDef {
  slug: string
  tabela: string
  titulo: string
  singular: string
  descricao: string
  campos: CampoDef[]
  /** Campos exibidos na listagem (na ordem). */
  colunasLista: string[]
  /** Colunas pesquisadas pela busca textual. */
  busca: string[]
  ordem: string
  /** A tabela possui valido_ate (preenchida ao desativar). */
  temValidoAte: boolean
  /** Coluna/expressão usada como nome do registro. */
  rotulo: string
  /** Índice/constraint único -> mensagem amigável. */
  unicos: Record<string, string>
  /** Unicidades verificadas na aplicação (sem índice no banco). */
  unicosAplicacao?: { campo: string; mensagem: string; ignorarCaixa?: boolean }[]
  /** Oculto do índice de /cadastros (acessado a partir de outro cadastro). */
  oculto?: boolean
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const SITUACOES_EQUIPAMENTO: Opcao[] = [
  { valor: 'EM_CLIENTE', rotulo: 'Em cliente' },
  { valor: 'ESTOQUE', rotulo: 'Em estoque' },
  { valor: 'MANUTENCAO', rotulo: 'Em manutenção' },
  { valor: 'SUCATA', rotulo: 'Sucata' },
  { valor: 'BAIXADO', rotulo: 'Baixado' },
]

export const TIPOS_TECNICO: Opcao[] = [
  { valor: 'INTERNO', rotulo: 'Interno' },
  { valor: 'EXTERNO', rotulo: 'Externo' },
  { valor: 'TERCEIRO', rotulo: 'Terceiro' },
  { valor: 'APOIO', rotulo: 'Apoio' },
]

/** Tabela e expressão de rótulo de cada referência (usadas em subconsultas). */
export const REFERENCIAS: Record<ChaveReferencia, { tabela: string; rotulo: string; ordem: string }> = {
  empresa: { tabela: 'empresa', rotulo: 'nome', ordem: 'nome' },
  unidade: { tabela: 'unidade', rotulo: "nome || ' (' || codigo || ')'", ordem: 'nome' },
  rede: { tabela: 'rede', rotulo: 'nome', ordem: 'upper(nome)' },
  cliente: { tabela: 'cliente', rotulo: "fantasia || coalesce(' — ' || codigo_externo, '')", ordem: 'upper(fantasia)' },
  familia_equipamento: { tabela: 'familia_equipamento', rotulo: 'nome', ordem: 'ordem, nome' },
  modelo_equipamento: {
    tabela: 'modelo_equipamento',
    rotulo: "(select f.nome from familia_equipamento f where f.id = familia_id) || ' — ' || nome",
    ordem: 'familia_id, nome',
  },
  familia_peca: { tabela: 'familia_peca', rotulo: 'nome', ordem: 'upper(nome)' },
}

export const ENTIDADES: EntidadeDef[] = [
  {
    slug: 'unidades', tabela: 'unidade', titulo: 'Unidades', singular: 'unidade',
    descricao: 'Unidades operacionais da empresa (ex.: Caieiras).',
    campos: [
      { nome: 'empresa_id', rotulo: 'Empresa', tipo: 'referencia', referencia: 'empresa', obrigatorio: true },
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true, max: 30, maiusculas: true, ajuda: 'Identificador curto, sem espaços (ex.: CAIEIRAS).' },
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 },
    ],
    colunasLista: ['codigo', 'nome', 'empresa_id'], busca: ['codigo', 'nome'], ordem: 'nome',
    temValidoAte: false, rotulo: 'nome', unicos: { unidade_codigo_key: 'Já existe uma unidade com este código.' },
  },
  {
    slug: 'redes', tabela: 'rede', titulo: 'Redes', singular: 'rede',
    descricao: 'Redes de clientes (agrupamento comercial).',
    campos: [{ nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 }],
    colunasLista: ['nome'], busca: ['nome'], ordem: 'upper(nome)',
    temValidoAte: false, rotulo: 'nome', unicos: { rede_nome_uk: 'Já existe uma rede com este nome.' },
  },
  {
    slug: 'clientes', tabela: 'cliente', titulo: 'Clientes', singular: 'cliente',
    descricao: 'Clientes com código Protheus, rede, unidade e contratos de comodato.',
    campos: [
      { nome: 'fantasia', rotulo: 'Nome fantasia', tipo: 'texto', obrigatorio: true, max: 160 },
      { nome: 'razao_social', rotulo: 'Razão social', tipo: 'texto', max: 200 },
      { nome: 'codigo_externo', rotulo: 'Código externo (Protheus)', tipo: 'texto', max: 30, maiusculas: true, ajuda: 'A1_COD + A1_LOJA, quando houver.' },
      { nome: 'rede_id', rotulo: 'Rede', tipo: 'referencia', referencia: 'rede' },
      { nome: 'unidade_id', rotulo: 'Unidade', tipo: 'referencia', referencia: 'unidade' },
      { nome: 'cidade', rotulo: 'Cidade', tipo: 'texto', max: 120 },
      { nome: 'uf', rotulo: 'UF', tipo: 'uf' },
    ],
    colunasLista: ['fantasia', 'codigo_externo', 'rede_id', 'cidade', 'uf'],
    busca: ['fantasia', 'razao_social', 'codigo_externo', 'cidade'], ordem: 'upper(fantasia)',
    temValidoAte: true, rotulo: 'fantasia',
    unicos: { cliente_codigo_uk: 'Já existe um cliente com este código externo (Protheus).' },
  },
  {
    slug: 'contratos', tabela: 'contrato_comodato', titulo: 'Contratos de comodato', singular: 'contrato de comodato',
    descricao: 'Contratos de comodato por cliente, com consumo mínimo (kg/mês).', oculto: true,
    campos: [
      { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'referencia', referencia: 'cliente', obrigatorio: true },
      { nome: 'numero', rotulo: 'Número do contrato', tipo: 'texto', max: 60 },
      { nome: 'inicio', rotulo: 'Início', tipo: 'data' },
      { nome: 'fim', rotulo: 'Fim', tipo: 'data' },
      { nome: 'consumo_minimo_kg_mes', rotulo: 'Consumo mínimo (kg/mês)', tipo: 'decimal', min: 0, ajuda: 'Deixe em branco se não houver consumo mínimo contratado.' },
    ],
    colunasLista: ['cliente_id', 'numero', 'inicio', 'fim', 'consumo_minimo_kg_mes'],
    busca: ['numero'], ordem: 'id desc', temValidoAte: false, rotulo: "coalesce(numero, 'Contrato ' || id)", unicos: {},
  },
  {
    slug: 'familias-equipamento', tabela: 'familia_equipamento', titulo: 'Famílias de equipamento', singular: 'família de equipamento',
    descricao: 'Famílias (forno, climatizadora…) e sinônimos usados na importação da planilha.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 80, maiusculas: true },
      { nome: 'ordem', rotulo: 'Ordem de exibição', tipo: 'inteiro', min: 0, padrao: '0' },
    ],
    colunasLista: ['nome', 'ordem'], busca: ['nome'], ordem: 'ordem, nome',
    temValidoAte: false, rotulo: 'nome', unicos: { familia_equipamento_uk: 'Já existe uma família de equipamento com este nome.' },
  },
  {
    slug: 'modelos', tabela: 'modelo_equipamento', titulo: 'Modelos de equipamento', singular: 'modelo',
    descricao: 'Modelos por família de equipamento.',
    campos: [
      { nome: 'familia_id', rotulo: 'Família', tipo: 'referencia', referencia: 'familia_equipamento', obrigatorio: true },
      { nome: 'nome', rotulo: 'Nome do modelo', tipo: 'texto', obrigatorio: true, max: 120 },
    ],
    colunasLista: ['nome', 'familia_id'], busca: ['nome'], ordem: 'nome',
    temValidoAte: false, rotulo: 'nome',
    unicos: { modelo_equipamento_familia_id_nome_key: 'Já existe um modelo com este nome nesta família.' },
  },
  {
    slug: 'equipamentos', tabela: 'equipamento', titulo: 'Equipamentos', singular: 'equipamento',
    descricao: 'Equipamentos com patrimônio/serial, linha, situação e cliente atual.',
    campos: [
      { nome: 'familia_id', rotulo: 'Família', tipo: 'referencia', referencia: 'familia_equipamento', obrigatorio: true },
      { nome: 'modelo_id', rotulo: 'Modelo', tipo: 'referencia', referencia: 'modelo_equipamento', ajuda: 'O modelo deve pertencer à família escolhida.' },
      { nome: 'patrimonio', rotulo: 'Patrimônio', tipo: 'texto', max: 40, maiusculas: true, ajuda: 'Informe patrimônio e/ou número de série.' },
      { nome: 'serial', rotulo: 'Número de série', tipo: 'texto', max: 60, maiusculas: true },
      { nome: 'linha', rotulo: 'Linha', tipo: 'selecao', opcoes: [{ valor: 'PADRAO', rotulo: 'Padrão' }, { valor: 'STAR', rotulo: 'Star' }] },
      { nome: 'situacao', rotulo: 'Situação', tipo: 'selecao', opcoes: SITUACOES_EQUIPAMENTO, obrigatorio: true, padrao: 'ESTOQUE' },
      { nome: 'cliente_id', rotulo: 'Cliente atual', tipo: 'referencia', referencia: 'cliente', ajuda: 'Obrigatório quando a situação é "Em cliente".' },
      { nome: 'entrada_estoque_em', rotulo: 'Entrada no estoque', tipo: 'data' },
      { nome: 'ultima_movimentacao_em', rotulo: 'Última movimentação', tipo: 'data' },
    ],
    colunasLista: ['patrimonio', 'serial', 'familia_id', 'linha', 'situacao', 'cliente_id'],
    busca: ['patrimonio', 'serial'], ordem: 'patrimonio nulls last, id',
    temValidoAte: false, rotulo: "coalesce(patrimonio, serial, 'Equipamento ' || id)",
    unicos: { equipamento_patrimonio_uk: 'Já existe um equipamento com este patrimônio.' },
    unicosAplicacao: [{ campo: 'serial', mensagem: 'Já existe um equipamento com este número de série.', ignorarCaixa: true }],
  },
  {
    slug: 'tecnicos', tabela: 'tecnico', titulo: 'Técnicos', singular: 'técnico',
    descricao: 'Técnicos internos, externos, terceiros e de apoio.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', opcoes: TIPOS_TECNICO, obrigatorio: true, padrao: 'EXTERNO' },
    ],
    colunasLista: ['nome', 'tipo'], busca: ['nome'], ordem: 'upper(nome)',
    temValidoAte: true, rotulo: 'nome', unicos: { tecnico_nome_uk: 'Já existe um técnico com este nome.' },
  },
  {
    slug: 'familias-peca', tabela: 'familia_peca', titulo: 'Famílias de peças', singular: 'família de peças',
    descricao: 'Agrupamento de peças com classe ABC.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 },
      { nome: 'classe_abc', rotulo: 'Classe ABC', tipo: 'selecao', opcoes: [{ valor: 'A', rotulo: 'A' }, { valor: 'B', rotulo: 'B' }, { valor: 'C', rotulo: 'C' }] },
    ],
    colunasLista: ['nome', 'classe_abc'], busca: ['nome'], ordem: 'upper(nome)',
    temValidoAte: false, rotulo: 'nome', unicos: { familia_peca_uk: 'Já existe uma família de peças com este nome.' },
  },
  {
    slug: 'itens-peca', tabela: 'item_peca', titulo: 'Itens de peça', singular: 'item de peça',
    descricao: 'Peças com código, criticidade, estoque mínimo e unidade de medida.',
    campos: [
      { nome: 'familia_id', rotulo: 'Família de peças', tipo: 'referencia', referencia: 'familia_peca', obrigatorio: true },
      { nome: 'codigo', rotulo: 'Código', tipo: 'texto', max: 40, maiusculas: true },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, max: 200 },
      { nome: 'unidade_medida', rotulo: 'Unidade de medida', tipo: 'texto', obrigatorio: true, max: 10, maiusculas: true, padrao: 'UN' },
      { nome: 'critico', rotulo: 'Item crítico', tipo: 'booleano', padrao: false },
      { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'decimal', min: 0 },
    ],
    colunasLista: ['codigo', 'descricao', 'familia_id', 'unidade_medida', 'critico', 'estoque_minimo'],
    busca: ['codigo', 'descricao'], ordem: 'descricao',
    temValidoAte: false, rotulo: 'descricao', unicos: { item_peca_codigo_uk: 'Já existe um item de peça com este código.' },
  },
  {
    slug: 'locais-estoque', tabela: 'local_estoque', titulo: 'Locais de estoque', singular: 'local de estoque',
    descricao: 'Locais físicos de estoque por unidade.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 },
      { nome: 'unidade_id', rotulo: 'Unidade', tipo: 'referencia', referencia: 'unidade' },
    ],
    colunasLista: ['nome', 'unidade_id'], busca: ['nome'], ordem: 'nome',
    temValidoAte: false, rotulo: 'nome', unicos: {},
    unicosAplicacao: [{ campo: 'nome', mensagem: 'Já existe um local de estoque com este nome.', ignorarCaixa: true }],
  },
  {
    slug: 'sistemas-ti', tabela: 'ti_sistema', titulo: 'Sistemas de TI', singular: 'sistema de TI',
    descricao: 'Sistemas monitorados para disponibilidade (críticos entram no indicador).',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, max: 120 },
      { nome: 'critico', rotulo: 'Sistema crítico', tipo: 'booleano', padrao: true },
    ],
    colunasLista: ['nome', 'critico'], busca: ['nome'], ordem: 'nome',
    temValidoAte: false, rotulo: 'nome', unicos: { ti_sistema_nome_key: 'Já existe um sistema de TI com este nome.' },
  },
]

export function entidadePorSlug(slug: string): EntidadeDef | undefined {
  return ENTIDADES.find((e) => e.slug === slug)
}

/** Rótulo de uma opção de seleção (ou o próprio valor). */
export function rotuloOpcao(campo: CampoDef, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  return campo.opcoes?.find((o) => o.valor === String(valor))?.rotulo ?? String(valor)
}
