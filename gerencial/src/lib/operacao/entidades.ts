import type { z } from 'zod'
import type { AreaCodigo } from '@/lib/auth/permissoes'
import type { Db } from '@/lib/db'
import { dataLocalDe, type Entrada } from '@/lib/validacao/comum'
import * as MI from '@/lib/validacao/manutencao-interna'
import * as ME from '@/lib/validacao/manutencao-externa'
import * as EST from '@/lib/validacao/estoque'
import * as COM from '@/lib/validacao/comodato'
import * as TI from '@/lib/validacao/ti'
import type { RefCadastro } from './cadastros'
import type { CalculoGrade, RegraUi, TipoCampo } from './tipos'

/**
 * Registro declarativo das entidades operacionais. Formulário, grade, "colar linhas",
 * listagem, exportação CSV e gravação (crud.ts) são genéricos sobre estas definições.
 * Nomes de tabela/coluna aqui são fixos no código — nunca derivados de entrada do usuário.
 */
export interface CampoDef {
  nome: string
  rotulo: string
  tipo: TipoCampo
  obrigatorio?: boolean
  ajuda?: string
  opcoes?: readonly string[]
  rotulosOpcoes?: Record<string, string>
  ref?: RefCadastro
  /** Campo de formulário que não é coluna (ex.: número do chamado vinculado). */
  virtual?: boolean
  /** Coluna preenchida pelo servidor (ex.: id resolvido de um vínculo); não aparece no formulário. */
  oculto?: boolean
  lista?: boolean
  grade?: boolean
  grupo?: string
  largo?: boolean
  somenteLeitura?: boolean
}

export interface Vinculo {
  campoNumero: string
  coluna: string
  tabela: 'chamado_externo' | 'chamado_ti'
  rotulo: string
  rotaRegistro: string
}

export type Dados = Record<string, unknown>

export interface EntidadeDef {
  chave: string
  tabela: string
  area: AreaCodigo
  secao: string
  titulo: string
  singular: string
  descricao?: string
  /** Rota da listagem; com `segmento`, a página agrega várias entidades (?ent=segmento). */
  rota: string
  segmento?: string
  campos: CampoDef[]
  schema: z.ZodType<Dados>
  ordem: string
  busca: string[]
  filtros: string[]
  semCompetencia?: boolean
  /** A competência é derivada da data do evento quando não informada. */
  competenciaDerivada: boolean
  dataEvento: (d: Dados) => string | null
  chaveNegocio?: { colunas: string[]; mensagem: (d: Dados) => string; campo: string }
  controle: { versao: boolean; atualizado: boolean; exclusao: 'completa' | 'simples' | 'fisica'; origem: boolean }
  vinculos?: Vinculo[]
  pecas?: 'INTERNA' | 'EXTERNA'
  dataPecas?: (d: Dados) => string
  anexos?: boolean
  restrito?: { tabela: string; chave: string; schema: z.ZodType<Dados>; campos: CampoDef[] }
  calculadas?: { nome: string; rotulo: string; sql: string; tipo: TipoCampo }[]
  padroes?: Entrada
  regrasUi?: RegraUi[]
  calculoGrade?: CalculoGrade
  /** Colunas extras na inclusão (ex.: responsável = usuário). */
  extrasInsercao?: (usuarioId: string) => Record<string, unknown>
  /** Motivo para impedir edição do registro (ex.: movimento gerado por outro lançamento). */
  somenteLeitura?: (reg: Dados) => string | null
  completar?: (db: Db, d: Dados) => Promise<void>
  /** Campos virtuais recalculados a partir do registro gravado. */
  entradaVirtual?: (reg: Dados) => Entrada
  rotuloRegistro: (reg: Dados) => string
}

const en = (nome: string, rotulo: string, valores: readonly string[], rotulos: Record<string, string>, extra: Partial<CampoDef> = {}): CampoDef => ({
  nome, rotulo, tipo: 'enum', opcoes: valores, rotulosOpcoes: rotulos, ...extra,
})
const ref = (nome: string, rotulo: string, r: RefCadastro, extra: Partial<CampoDef> = {}): CampoDef => ({ nome, rotulo, tipo: 'ref', ref: r, ...extra })
const competenciaCampo = (ajuda?: string): CampoDef => ({ nome: 'competencia', rotulo: 'Competência', tipo: 'competencia', obrigatorio: !ajuda, ajuda, grade: false })
const COMPLETO = { versao: true, atualizado: true, exclusao: 'completa', origem: true } as const
const SIMPLES = { versao: true, atualizado: false, exclusao: 'simples', origem: false } as const
const FISICO = { versao: false, atualizado: false, exclusao: 'fisica', origem: false } as const
const s = (x: unknown) => (x == null ? null : String(x))
const dl = (x: unknown) => (x ? dataLocalDe(x as string | Date) : null)
const maxData = (a: string | null, b: string) => (a && a > b ? a : b)

/* ------------------------------------------------------------------ */
/* Manutenção interna                                                  */
/* ------------------------------------------------------------------ */

const manutInterna: EntidadeDef = {
  chave: 'manut_interna', tabela: 'manut_interna', area: 'MANUT_INTERNA', secao: 'lancamentos',
  titulo: 'Lançamentos da oficina', singular: 'lançamento da oficina', rota: '/manutencao-interna/lancamentos',
  descricao: 'Serviços realizados na oficina. As peças utilizadas geram automaticamente as saídas no estoque.',
  campos: [
    competenciaCampo('Mês da conclusão; se vazio, é derivada da data de conclusão.'),
    { nome: 'data_recebimento', rotulo: 'Data de recebimento', tipo: 'data', lista: true, grade: true },
    { nome: 'data_conclusao', rotulo: 'Data de conclusão', tipo: 'data', lista: true, grade: true, ajuda: 'Obrigatória, exceto para resultado Pendente.' },
    ref('unidade_id', 'Unidade', 'unidade'),
    ref('familia_id', 'Família do equipamento', 'familia_equipamento', { obrigatorio: true, lista: true, grade: true }),
    ref('modelo_id', 'Modelo', 'modelo_equipamento'),
    ref('equipamento_id', 'Equipamento (cadastro)', 'equipamento'),
    { nome: 'identificador', rotulo: 'Patrimônio / serial', tipo: 'texto', lista: true, grade: true },
    en('tipo_servico', 'Tipo de serviço', MI.TIPOS_SERVICO, MI.ROTULOS_TIPO_SERVICO, { obrigatorio: true, lista: true, grade: true }),
    en('resultado', 'Resultado', MI.RESULTADOS, MI.ROTULOS_RESULTADO, { obrigatorio: true, lista: true, grade: true }),
    ref('tecnico_id', 'Técnico', 'tecnico', { lista: true, grade: true }),
    { nome: 'motivo_sucateamento', rotulo: 'Motivo do sucateamento', tipo: 'texto', grade: true, ajuda: 'Obrigatório quando o resultado for Sucateado.' },
    { nome: 'retorno_aplicavel_higienizacao', rotulo: 'Retorno aplicável à higienização', tipo: 'boolNulo' },
    { nome: 'custo_mao_obra', rotulo: 'Custo de mão de obra (R$)', tipo: 'moeda', grade: true, lista: true },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textoLongo', largo: true },
  ],
  schema: MI.manutInternaSchema as z.ZodType<Dados>,
  ordem: 'coalesce(t.data_conclusao, t.data_recebimento) desc nulls last, t.id desc',
  busca: ['t.identificador', 't.observacao', 't.motivo_sucateamento'],
  filtros: ['resultado', 'tipo_servico', 'familia_id', 'tecnico_id'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data_conclusao) ?? s(d.data_recebimento),
  controle: COMPLETO,
  pecas: 'INTERNA',
  dataPecas: (d) => s(d.data_conclusao) ?? maxData(s(d.data_recebimento), String(d.competencia)),
  anexos: true,
  padroes: { tipo_servico: 'RECUPERACAO' },
  rotuloRegistro: (r) => `Lançamento #${r.id}${r.identificador ? ` — ${r.identificador}` : ''}`,
}

const preventivaPlano: EntidadeDef = {
  chave: 'manut_preventiva_plano', tabela: 'manut_preventiva_plano', area: 'MANUT_INTERNA', secao: 'preventivas',
  titulo: 'Plano de preventivas', singular: 'item do plano de preventivas', rota: '/manutencao-interna/preventivas',
  descricao: 'Quantidade planejada de preventivas por mês e família (denominador de "preventiva realizada × plano").',
  campos: [
    competenciaCampo(),
    ref('familia_id', 'Família do equipamento', 'familia_equipamento', { lista: true, grade: true, ajuda: 'Vazio = plano geral (todas as famílias).' }),
    { nome: 'quantidade_planejada', rotulo: 'Quantidade planejada', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
  ],
  schema: MI.preventivaPlanoSchema as z.ZodType<Dados>,
  ordem: 't.competencia desc, t.id',
  busca: [],
  filtros: ['familia_id'],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia', 'familia_id'], campo: 'familia_id', mensagem: () => 'Já existe plano para esta família nesta competência.' },
  controle: FISICO,
  rotuloRegistro: (r) => `Plano #${r.id}`,
}

/* ------------------------------------------------------------------ */
/* Manutenção externa                                                  */
/* ------------------------------------------------------------------ */

const G_ID = 'Identificação', G_DATAS = 'Datas e horas', G_EQ = 'Cliente e equipamento', G_AT = 'Atendimento', G_CL = 'Classificação e SLA'
const chamadoExterno: EntidadeDef = {
  chave: 'chamado_externo', tabela: 'chamado_externo', area: 'MANUT_EXTERNA', secao: 'chamados',
  titulo: 'Chamados de manutenção externa', singular: 'chamado', rota: '/manutencao-externa/chamados',
  descricao: 'Chamados em campo. Datas e horas no fuso de Brasília; peças utilizadas geram saídas no estoque.',
  campos: [
    { nome: 'numero', rotulo: 'Número do chamado', tipo: 'texto', obrigatorio: true, lista: true, grade: true, grupo: G_ID },
    competenciaCampo('Mês da abertura; se vazio, é derivada da abertura.'),
    en('tipo_atendimento', 'Tipo de atendimento', ME.TIPOS_ATENDIMENTO, ME.ROTULOS_TIPO_ATENDIMENTO, { obrigatorio: true, lista: true, grade: true, grupo: G_ID }),
    en('status', 'Status', ME.STATUS_CHAMADO, ME.ROTULOS_STATUS_CHAMADO, { obrigatorio: true, lista: true, grade: true, grupo: G_ID }),
    { nome: 'aberto_em', rotulo: 'Abertura', tipo: 'dataHora', obrigatorio: true, lista: true, grade: true, grupo: G_DATAS },
    { nome: 'primeira_resposta_em', rotulo: '1ª resposta', tipo: 'dataHora', grade: true, grupo: G_DATAS },
    { nome: 'atendido_em', rotulo: 'Atendimento', tipo: 'dataHora', grade: true, grupo: G_DATAS },
    { nome: 'encerrado_em', rotulo: 'Encerramento', tipo: 'dataHora', grade: true, lista: true, grupo: G_DATAS },
    ref('cliente_id', 'Cliente', 'cliente', { lista: true, grade: true, grupo: G_EQ, ajuda: 'A rede é obtida do cadastro do cliente.' }),
    ref('unidade_id', 'Unidade', 'unidade', { grupo: G_EQ }),
    { nome: 'solicitante', rotulo: 'Solicitante', tipo: 'texto', grupo: G_EQ },
    ref('familia_id', 'Família do equipamento', 'familia_equipamento', { lista: true, grade: true, grupo: G_EQ }),
    ref('modelo_id', 'Modelo', 'modelo_equipamento', { grupo: G_EQ }),
    ref('equipamento_id', 'Equipamento (cadastro)', 'equipamento', { grupo: G_EQ }),
    { nome: 'identificador', rotulo: 'Patrimônio / serial', tipo: 'texto', grupo: G_EQ },
    { nome: 'equipamento_do_cliente', rotulo: 'Equipamento do cliente', tipo: 'bool', grupo: G_EQ },
    ref('tecnico_id', 'Técnico', 'tecnico', { lista: true, grade: true, grupo: G_AT }),
    { nome: 'causa', rotulo: 'Causa', tipo: 'textoLongo', grupo: G_AT },
    { nome: 'solucao', rotulo: 'Solução', tipo: 'textoLongo', grupo: G_AT },
    { nome: 'resolvido_primeira_visita', rotulo: 'Resolvido na 1ª visita', tipo: 'boolNulo', grade: true, grupo: G_AT },
    { nome: 'reserva_disponibilizada', rotulo: 'Reserva disponibilizada', tipo: 'boolNulo', grupo: G_AT },
    { nome: 'valor_cobrado', rotulo: 'Valor cobrado (R$)', tipo: 'moeda', grupo: G_AT },
    { nome: 'equipamento_parado', rotulo: 'Equipamento parado', tipo: 'bool', grade: true, grupo: G_CL, ajuda: 'Equipamento parado define criticidade P1 automaticamente.' },
    en('criticidade', 'Criticidade', ME.CRITICIDADES, ME.ROTULOS_CRITICIDADE, { grade: true, lista: true, grupo: G_CL }),
    { nome: 'necessario', rotulo: 'Chamado necessário', tipo: 'boolNulo', grade: true, grupo: G_CL, ajuda: 'Vazio = ainda não classificado.' },
    en('motivo_desnecessario', 'Motivo (desnecessário)', ME.MOTIVOS_DESNECESSARIO, ME.ROTULOS_MOTIVO_DESNECESSARIO, { grade: true, grupo: G_CL }),
    { nome: 'justificativa_desnecessario', rotulo: 'Justificativa (desnecessário)', tipo: 'texto', grade: true, grupo: G_CL },
    { nome: 'reincidencia', rotulo: 'Reincidência', tipo: 'boolNulo', virtual: true, grupo: G_CL },
    { nome: 'chamado_anterior_numero', rotulo: 'Nº do chamado anterior', tipo: 'texto', virtual: true, grupo: G_CL, ajuda: 'Obrigatório em reincidência.' },
    { nome: 'chamado_anterior_id', rotulo: 'Chamado anterior', tipo: 'inteiro', oculto: true },
    { nome: 'elegivel_sla', rotulo: 'Elegível ao SLA', tipo: 'bool', grade: true, grupo: G_CL },
    { nome: 'motivo_inelegivel_sla', rotulo: 'Motivo da inelegibilidade', tipo: 'texto', grade: true, grupo: G_CL },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textoLongo', largo: true, grupo: G_CL },
  ],
  schema: ME.chamadoExternoSchema as z.ZodType<Dados>,
  ordem: 't.aberto_em desc, t.id desc',
  busca: ['t.numero', 't.solicitante', 't.identificador', 't.causa', 't.solucao', `(select c.fantasia from cliente c where c.id = t.cliente_id)`],
  filtros: ['status', 'tipo_atendimento', 'tecnico_id', 'familia_id', 'necessario', 'criticidade'],
  competenciaDerivada: true,
  dataEvento: (d) => dl(d.aberto_em),
  chaveNegocio: { colunas: ['numero'], campo: 'numero', mensagem: (d) => `Já existe um chamado com o número ${d.numero}.` },
  controle: COMPLETO,
  vinculos: [{ campoNumero: 'chamado_anterior_numero', coluna: 'chamado_anterior_id', tabela: 'chamado_externo', rotulo: 'Chamado', rotaRegistro: '/manutencao-externa/chamados' }],
  pecas: 'EXTERNA',
  dataPecas: (d) => dl(d.atendido_em) ?? dl(d.encerrado_em) ?? dl(d.aberto_em)!,
  anexos: true,
  calculadas: [{ nome: 'rede', rotulo: 'Rede', tipo: 'texto', sql: `(select r.nome from cliente c join rede r on r.id = c.rede_id where c.id = t.cliente_id)` }],
  padroes: { status: 'ABERTO', tipo_atendimento: 'CORRETIVA', elegivel_sla: 'true', equipamento_do_cliente: 'false', equipamento_parado: 'false' },
  regrasUi: [{ campo: 'equipamento_parado', valor: 'true', definir: 'criticidade', para: 'P1', aviso: 'Equipamento parado: criticidade P1 aplicada automaticamente.' }],
  entradaVirtual: (r) => ({ reincidencia: r.chamado_anterior_id ? 'true' : '' }),
  rotuloRegistro: (r) => `Chamado ${r.numero}`,
}

const solicitacaoTroca: EntidadeDef = {
  chave: 'solicitacao_troca', tabela: 'solicitacao_troca', area: 'MANUT_EXTERNA', secao: 'trocas',
  titulo: 'Solicitações de troca de equipamento', singular: 'solicitação de troca', rota: '/manutencao-externa/trocas',
  campos: [
    competenciaCampo('Mês da solicitação; se vazio, é derivada da data de solicitação.'),
    { nome: 'chamado_numero', rotulo: 'Nº do chamado vinculado', tipo: 'texto', virtual: true, lista: false, grade: true },
    { nome: 'chamado_externo_id', rotulo: 'Chamado', tipo: 'inteiro', oculto: true },
    { nome: 'data_solicitacao', rotulo: 'Data da solicitação', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    { nome: 'data_troca', rotulo: 'Data da troca', tipo: 'data', lista: true, grade: true },
    en('status', 'Status', ME.STATUS_TROCA, ME.ROTULOS_STATUS_TROCA, { obrigatorio: true, lista: true, grade: true }),
    ref('cliente_id', 'Cliente (cadastro)', 'cliente', { lista: true, grade: true }),
    { nome: 'cliente_texto', rotulo: 'Cliente (texto livre)', tipo: 'texto', grade: true, ajuda: 'Use quando o cliente não estiver cadastrado.' },
    ref('solicitado_por_tecnico_id', 'Solicitado por (técnico)', 'tecnico', { grade: true }),
    { nome: 'solicitado_por_texto', rotulo: 'Solicitado por (texto)', tipo: 'texto' },
    ref('familia_id', 'Família do equipamento', 'familia_equipamento', { lista: true, grade: true }),
    { nome: 'equipamento_texto', rotulo: 'Equipamento', tipo: 'texto', grade: true },
    en('linha', 'Linha', ME.LINHAS, ME.ROTULOS_LINHA, { grade: true }),
    { nome: 'causa', rotulo: 'Causa', tipo: 'textoLongo', largo: true },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textoLongo', largo: true },
  ],
  schema: ME.solicitacaoTrocaSchema as z.ZodType<Dados>,
  ordem: 't.data_solicitacao desc, t.id desc',
  busca: ['t.cliente_texto', 't.equipamento_texto', 't.causa', 't.solicitado_por_texto', `(select c.fantasia from cliente c where c.id = t.cliente_id)`],
  filtros: ['status', 'familia_id', 'linha'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data_solicitacao),
  controle: COMPLETO,
  vinculos: [{ campoNumero: 'chamado_numero', coluna: 'chamado_externo_id', tabela: 'chamado_externo', rotulo: 'Chamado', rotaRegistro: '/manutencao-externa/chamados' }],
  padroes: { status: 'PENDENTE' },
  rotuloRegistro: (r) => `Solicitação de troca #${r.id}`,
}

/* ------------------------------------------------------------------ */
/* Estoque de peças                                                    */
/* ------------------------------------------------------------------ */

const movimentoEstoque: EntidadeDef = {
  chave: 'movimento_estoque', tabela: 'movimento_estoque', area: 'ESTOQUE_PECAS', secao: 'movimentos',
  titulo: 'Movimentações de estoque', singular: 'movimentação', rota: '/estoque-pecas/movimentos',
  descricao: 'O saldo é calculado a partir destas movimentações — nunca é digitado. Saídas de peças usadas em manutenção são geradas pelos lançamentos de origem.',
  campos: [
    competenciaCampo('Deve ser o mês da data; se vazio, é derivada da data.'),
    { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    en('tipo', 'Tipo', EST.TIPOS_MOVIMENTO, EST.ROTULOS_TIPO_MOVIMENTO, { obrigatorio: true, lista: true, grade: true }),
    ref('familia_id', 'Família da peça', 'familia_peca', { obrigatorio: true, lista: true, grade: true }),
    ref('item_peca_id', 'Item', 'item_peca', { lista: true, grade: true }),
    ref('local_estoque_id', 'Local', 'local_estoque', { lista: true, grade: true }),
    ref('local_destino_id', 'Local de destino', 'local_estoque', { grade: true, ajuda: 'Obrigatório em transferências.' }),
    { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'decimal', obrigatorio: true, lista: true, grade: true, ajuda: 'Positiva; negativa somente em Ajuste.' },
    { nome: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'moeda', lista: true, grade: true },
    { nome: 'documento_origem', rotulo: 'Documento de origem', tipo: 'texto', lista: true, grade: true },
    en('aplicacao', 'Aplicação (saídas)', EST.APLICACOES, EST.ROTULOS_APLICACAO, { lista: true }),
    { nome: 'motivo', rotulo: 'Motivo', tipo: 'texto', grade: true },
    { nome: 'justificativa_ajuste', rotulo: 'Justificativa do ajuste', tipo: 'texto', grade: true, ajuda: 'Obrigatória em ajustes.' },
  ],
  schema: EST.movimentoEstoqueSchema as z.ZodType<Dados>,
  ordem: 't.data desc, t.id desc',
  busca: ['t.documento_origem', 't.motivo', 't.justificativa_ajuste', `(select i.descricao || coalesce(i.codigo,'') from item_peca i where i.id = t.item_peca_id)`],
  filtros: ['tipo', 'familia_id', 'local_estoque_id', 'aplicacao'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data),
  controle: COMPLETO,
  extrasInsercao: (u) => ({ responsavel_id: u }),
  calculadas: [{
    nome: 'origem_lancamento', rotulo: 'Lançamento de origem', tipo: 'texto',
    sql: `case when t.manut_interna_id is not null then 'Oficina #' || t.manut_interna_id when t.chamado_externo_id is not null then 'Chamado ' || (select c.numero from chamado_externo c where c.id = t.chamado_externo_id) end`,
  }],
  somenteLeitura: (r) =>
    r.manut_interna_id ? 'Movimento gerado pelo lançamento da oficina; altere as peças no lançamento de origem.'
      : r.chamado_externo_id ? 'Movimento gerado pelo chamado externo; altere as peças no chamado de origem.' : null,
  rotuloRegistro: (r) => `Movimentação #${r.id}`,
}

/* ------------------------------------------------------------------ */
/* Comodato                                                            */
/* ------------------------------------------------------------------ */

const comodatoMovimento: EntidadeDef = {
  chave: 'comodato_movimento', tabela: 'comodato_movimento', area: 'COMODATO', secao: 'movimentos',
  titulo: 'Entregas, trocas e retiradas', singular: 'movimento de comodato', rota: '/comodato/movimentos',
  descricao: 'Registre as tentativas de execução no detalhe do movimento; uma tentativa com sucesso conclui o movimento.',
  campos: [
    { nome: 'solicitacao_numero', rotulo: 'Nº da solicitação', tipo: 'texto', lista: true, grade: true },
    competenciaCampo('Mês da solicitação; se vazio, é derivada da data de solicitação.'),
    en('tipo', 'Tipo', COM.TIPOS_COMODATO, COM.ROTULOS_TIPO_COMODATO, { obrigatorio: true, lista: true, grade: true }),
    en('situacao', 'Situação', COM.SITUACOES_COMODATO, COM.ROTULOS_SITUACAO_COMODATO, { obrigatorio: true, lista: true, grade: true }),
    ref('cliente_id', 'Cliente (cadastro)', 'cliente', { lista: true, grade: true }),
    { nome: 'cliente_texto', rotulo: 'Cliente (texto livre)', tipo: 'texto', grade: true, ajuda: 'Use quando o cliente não estiver cadastrado.' },
    ref('familia_id', 'Família do equipamento', 'familia_equipamento', { lista: true, grade: true }),
    ref('equipamento_id', 'Equipamento (cadastro)', 'equipamento'),
    { nome: 'campanha_fim_ano', rotulo: 'Campanha de fim de ano', tipo: 'bool', grade: true },
    { nome: 'data_solicitacao', rotulo: 'Data da solicitação', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    { nome: 'data_agendamento', rotulo: 'Data de agendamento', tipo: 'data', grade: true },
    { nome: 'data_conclusao', rotulo: 'Data de conclusão', tipo: 'data', lista: true, grade: true },
    { nome: 'motivo_insucesso', rotulo: 'Motivo do insucesso', tipo: 'texto', grade: true, ajuda: 'Obrigatório na situação Sem êxito.' },
    { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', grade: true },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textoLongo', largo: true },
  ],
  schema: COM.comodatoMovimentoSchema as z.ZodType<Dados>,
  ordem: 't.data_solicitacao desc, t.id desc',
  busca: ['t.solicitacao_numero', 't.cliente_texto', 't.responsavel', 't.observacao', `(select c.fantasia from cliente c where c.id = t.cliente_id)`],
  filtros: ['tipo', 'situacao', 'familia_id', 'campanha_fim_ano'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data_solicitacao),
  chaveNegocio: {
    colunas: ['solicitacao_numero', 'tipo'], campo: 'solicitacao_numero',
    mensagem: (d) => `Já existe ${String(d.tipo).toLowerCase()} com a solicitação nº ${d.solicitacao_numero}.`,
  },
  controle: COMPLETO,
  anexos: true,
  calculadas: [{ nome: 'tentativas', rotulo: 'Tentativas', tipo: 'inteiro', sql: '(select count(*)::int from comodato_tentativa x where x.movimento_id = t.id)' }],
  padroes: { situacao: 'SOLICITADO', campanha_fim_ano: 'false' },
  rotuloRegistro: (r) => `${COM.ROTULOS_TIPO_COMODATO[r.tipo as 'ENTREGA'] ?? 'Movimento'}${r.solicitacao_numero ? ` — solicitação ${r.solicitacao_numero}` : ` #${r.id}`}`,
}

const comodatoPosicao: EntidadeDef = {
  chave: 'comodato_posicao', tabela: 'comodato_posicao', area: 'COMODATO', secao: 'posicao',
  titulo: 'Posição mensal do estoque de comodato', singular: 'posição mensal', rota: '/comodato/posicao',
  descricao: 'Conciliação: posição anterior + entradas − saídas + ajuste = novos + usados. A posição anterior vem do mês anterior.',
  campos: [
    competenciaCampo(),
    { nome: 'produto', rotulo: 'Produto', tipo: 'texto', obrigatorio: true, lista: true, grade: true },
    ref('familia_id', 'Família', 'familia_equipamento'),
    ref('unidade_id', 'Unidade', 'unidade'),
    { nome: 'posicao_anterior', rotulo: 'Posição anterior', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
    { nome: 'entradas', rotulo: 'Entradas', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'saidas_novos', rotulo: 'Saídas novos', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'saidas_usados', rotulo: 'Saídas usados', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'novos', rotulo: 'Novos', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
    { nome: 'usados', rotulo: 'Usados', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
    { nome: 'manutencao_interna', rotulo: 'Em manutenção interna', tipo: 'inteiro', grade: true },
    { nome: 'sucata', rotulo: 'Sucata', tipo: 'inteiro', grade: true },
    { nome: 'custo_total_novos', rotulo: 'Custo total novos (R$)', tipo: 'moeda', grade: true },
    { nome: 'custo_total_usados', rotulo: 'Custo total usados (R$)', tipo: 'moeda', grade: true },
    { nome: 'ajuste', rotulo: 'Ajuste', tipo: 'inteiro', lista: true, grade: true, ajuda: 'Diferença justificada da conciliação.' },
    { nome: 'justificativa_ajuste', rotulo: 'Justificativa do ajuste', tipo: 'texto', grade: true },
  ],
  schema: COM.comodatoPosicaoSchema as z.ZodType<Dados>,
  ordem: 'upper(t.produto), t.id',
  busca: ['t.produto'],
  filtros: ['familia_id', 'unidade_id'],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia', 'upper:produto', 'coalesce:unidade_id'], campo: 'produto', mensagem: (d) => `Já existe posição do produto ${d.produto} nesta competência.` },
  controle: COMPLETO,
  padroes: { entradas: '0', saidas_novos: '0', saidas_usados: '0', ajuste: '0' },
  calculoGrade: 'conciliacao_posicao',
  rotuloRegistro: (r) => `Posição — ${r.produto}`,
}

const comodatoBase: EntidadeDef = {
  chave: 'comodato_base_ativa', tabela: 'comodato_base_ativa', area: 'COMODATO', secao: 'base',
  titulo: 'Base ativa (fotografia mensal)', singular: 'fotografia da base ativa', rota: '/comodato/base', segmento: 'base',
  descricao: 'Uma fotografia por competência, com a origem e a evidência do dado.',
  campos: [
    competenciaCampo(),
    { nome: 'equipamentos_ativos', rotulo: 'Equipamentos ativos', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
    { nome: 'clientes_ativos', rotulo: 'Clientes ativos', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'instalacoes', rotulo: 'Instalações no mês', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'retiradas', rotulo: 'Retiradas no mês', tipo: 'inteiro', lista: true, grade: true },
    en('origem', 'Origem do dado', COM.ORIGENS, COM.ROTULOS_ORIGEM, { obrigatorio: true, lista: true, grade: true }),
    { nome: 'evidencia', rotulo: 'Evidência', tipo: 'texto', obrigatorio: true, lista: true, grade: true, largo: true, ajuda: 'Relatório, consulta ou documento que comprova a fotografia.' },
  ],
  schema: COM.comodatoBaseAtivaSchema as z.ZodType<Dados>,
  ordem: 't.competencia desc, t.id desc',
  busca: ['t.evidencia'],
  filtros: ['origem'],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia'], campo: 'competencia', mensagem: () => 'Já existe fotografia da base ativa nesta competência.' },
  controle: SIMPLES,
  padroes: { origem: 'MANUAL' },
  rotuloRegistro: (r) => `Base ativa ${String(r.competencia).slice(5, 7)}/${String(r.competencia).slice(0, 4)}`,
}

const comodatoConsumo: EntidadeDef = {
  chave: 'comodato_consumo', tabela: 'comodato_consumo', area: 'COMODATO', secao: 'base',
  titulo: 'Consumo por cliente', singular: 'consumo do cliente', rota: '/comodato/base', segmento: 'consumo',
  descricao: 'Kg comprados por cliente no mês. Sem consumo mínimo informado, usa o do contrato de comodato ativo.',
  campos: [
    competenciaCampo(),
    ref('cliente_id', 'Cliente', 'cliente', { obrigatorio: true, lista: true, grade: true }),
    { nome: 'kg_comprados', rotulo: 'Kg comprados', tipo: 'decimal', obrigatorio: true, lista: true, grade: true },
    { nome: 'consumo_minimo_kg', rotulo: 'Consumo mínimo (kg)', tipo: 'decimal', lista: true, grade: true },
    { nome: 'aplicavel_minimo', rotulo: 'Consumo mínimo aplicável', tipo: 'bool', lista: true, grade: true },
  ],
  schema: COM.comodatoConsumoSchema as z.ZodType<Dados>,
  ordem: 't.kg_comprados desc, t.id',
  busca: [`(select c.fantasia from cliente c where c.id = t.cliente_id)`],
  filtros: ['aplicavel_minimo'],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia', 'coalesce:cliente_id'], campo: 'cliente_id', mensagem: () => 'Já existe consumo deste cliente nesta competência.' },
  controle: SIMPLES,
  padroes: { aplicavel_minimo: 'true' },
  completar: async (db, d) => {
    if (d.consumo_minimo_kg == null && d.cliente_id) {
      const r = await db.query<{ m: number | null }>(
        `select consumo_minimo_kg_mes as m from contrato_comodato where cliente_id = $1 and ativo
            and (inicio is null or inicio <= ($2::date + interval '1 month' - interval '1 day')) and (fim is null or fim >= $2::date)
          order by inicio desc nulls last limit 1`, [d.cliente_id, d.competencia])
      if (r.rows[0]?.m != null) d.consumo_minimo_kg = r.rows[0].m
    }
  },
  rotuloRegistro: (r) => `Consumo #${r.id}`,
}

/* ------------------------------------------------------------------ */
/* TI                                                                  */
/* ------------------------------------------------------------------ */

const T_ID = 'Identificação', T_DATAS = 'Datas e SLA', T_PESSOAS = 'Atendimento', T_RES = 'Resolução e satisfação', T_CONTATO = 'Contato (acesso restrito)'
const chamadoTi: EntidadeDef = {
  chave: 'chamado_ti', tabela: 'chamado_ti', area: 'TI', secao: 'chamados',
  titulo: 'Chamados de TI', singular: 'chamado de TI', rota: '/ti/chamados',
  campos: [
    { nome: 'numero', rotulo: 'Número', tipo: 'texto', obrigatorio: true, lista: true, grade: true, grupo: T_ID },
    en('sistema_origem', 'Sistema de origem', TI.SISTEMAS_ORIGEM, TI.ROTULOS_SISTEMA_ORIGEM, { obrigatorio: true, lista: true, grade: true, grupo: T_ID }),
    competenciaCampo('Mês da abertura; se vazio, é derivada da abertura.'),
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', lista: true, grade: true, grupo: T_ID, largo: true },
    en('status_normalizado', 'Status', TI.STATUS_TI, TI.ROTULOS_STATUS_TI, { obrigatorio: true, lista: true, grade: true, grupo: T_ID }),
    { nome: 'status', rotulo: 'Status na origem', tipo: 'texto', grupo: T_ID, ajuda: 'Texto original do sistema; se vazio, usa o status normalizado.' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'texto', grade: true, grupo: T_ID },
    { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'texto', lista: true, grade: true, grupo: T_ID },
    { nome: 'origem_canal', rotulo: 'Canal de abertura', tipo: 'texto', grupo: T_ID },
    { nome: 'nivel_suporte', rotulo: 'Nível de suporte', tipo: 'texto', grupo: T_ID },
    { nome: 'categoria', rotulo: 'Categoria', tipo: 'texto', lista: true, grade: true, grupo: T_ID },
    { nome: 'subcategoria', rotulo: 'Subcategoria', tipo: 'texto', grupo: T_ID },
    { nome: 'tags', rotulo: 'Tags', tipo: 'tags', grupo: T_ID, ajuda: 'Separadas por vírgula.' },
    { nome: 'dado_teste', rotulo: 'Dado de teste', tipo: 'bool', grupo: T_ID, ajuda: 'Chamados de teste não entram nos indicadores.' },
    { nome: 'aberto_em', rotulo: 'Abertura', tipo: 'dataHora', obrigatorio: true, lista: true, grade: true, grupo: T_DATAS },
    { nome: 'sla_prazo', rotulo: 'Prazo do SLA', tipo: 'dataHora', grupo: T_DATAS },
    { nome: 'sla_violado', rotulo: 'SLA violado', tipo: 'boolNulo', grade: true, grupo: T_DATAS },
    { nome: 'sla_violado_em', rotulo: 'SLA violado em', tipo: 'dataHora', grupo: T_DATAS },
    { nome: 'sla_horas_pausadas', rotulo: 'Horas pausadas (SLA)', tipo: 'decimal', grupo: T_DATAS },
    { nome: 'sla_desvio_h', rotulo: 'Desvio do SLA (h)', tipo: 'decimal', grupo: T_DATAS, ajuda: 'Pode ser negativo (antes do prazo).' },
    { nome: 'escalado_em', rotulo: 'Escalado em', tipo: 'dataHora', grupo: T_DATAS },
    { nome: 'fechado_em', rotulo: 'Fechamento', tipo: 'dataHora', lista: true, grade: true, grupo: T_DATAS },
    { nome: 'ultima_atualizacao_em', rotulo: 'Última atualização', tipo: 'dataHora', grupo: T_DATAS },
    { nome: 'tempo_resolucao_origem_h', rotulo: 'Tempo de resolução na origem (h)', tipo: 'decimal', grupo: T_DATAS },
    { nome: 'elegivel_sla', rotulo: 'Elegível ao SLA', tipo: 'bool', grade: true, grupo: T_DATAS },
    { nome: 'motivo_inelegivel_sla', rotulo: 'Motivo da inelegibilidade', tipo: 'texto', grade: true, grupo: T_DATAS },
    { nome: 'equipe', rotulo: 'Equipe', tipo: 'texto', grupo: T_PESSOAS },
    { nome: 'tecnico_responsavel', rotulo: 'Técnico responsável', tipo: 'texto', lista: true, grade: true, grupo: T_PESSOAS },
    { nome: 'solicitante', rotulo: 'Solicitante', tipo: 'texto', grade: true, grupo: T_PESSOAS },
    { nome: 'departamento', rotulo: 'Departamento', tipo: 'texto', grupo: T_PESSOAS },
    { nome: 'unidade_texto', rotulo: 'Unidade', tipo: 'texto', grupo: T_PESSOAS },
    { nome: 'solucao', rotulo: 'Solução', tipo: 'textoLongo', grupo: T_RES },
    { nome: 'causa_raiz', rotulo: 'Causa raiz', tipo: 'textoLongo', grupo: T_RES },
    { nome: 'motivo_cancelamento', rotulo: 'Motivo do cancelamento', tipo: 'texto', grupo: T_RES },
    { nome: 'resolvido_primeiro_contato', rotulo: 'Resolvido no 1º contato', tipo: 'boolNulo', grade: true, grupo: T_RES },
    { nome: 'chamado_anterior_numero', rotulo: 'Nº do chamado anterior (reabertura)', tipo: 'texto', virtual: true, grupo: T_RES },
    { nome: 'chamado_anterior_id', rotulo: 'Chamado anterior', tipo: 'inteiro', oculto: true },
    { nome: 'csat_nota', rotulo: 'CSAT (0 a 5)', tipo: 'decimal', grade: true, grupo: T_RES },
    { nome: 'csat_respondido_em', rotulo: 'CSAT respondido em', tipo: 'dataHora', grupo: T_RES },
    { nome: 'csat_comentario', rotulo: 'Comentário do CSAT', tipo: 'textoLongo', grupo: T_RES },
  ],
  schema: TI.chamadoTiSchema as z.ZodType<Dados>,
  ordem: 't.aberto_em desc, t.id desc',
  busca: ['t.numero', 't.titulo', 't.categoria', 't.tecnico_responsavel', 't.solicitante', 't.equipe'],
  filtros: ['status_normalizado', 'sistema_origem', 'sla_violado', 'dado_teste'],
  competenciaDerivada: true,
  dataEvento: (d) => dl(d.aberto_em),
  chaveNegocio: { colunas: ['sistema_origem', 'numero'], campo: 'numero', mensagem: (d) => `Já existe o chamado ${d.numero} no sistema ${d.sistema_origem}.` },
  controle: COMPLETO,
  vinculos: [{ campoNumero: 'chamado_anterior_numero', coluna: 'chamado_anterior_id', tabela: 'chamado_ti', rotulo: 'Chamado', rotaRegistro: '/ti/chamados' }],
  restrito: {
    tabela: 'chamado_ti_restrito', chave: 'chamado_id', schema: TI.chamadoTiRestritoSchema as z.ZodType<Dados>,
    campos: [
      { nome: 'email_solicitante', rotulo: 'E-mail do solicitante', tipo: 'email', grupo: T_CONTATO },
      { nome: 'ramal', rotulo: 'Ramal', tipo: 'texto', grupo: T_CONTATO },
      { nome: 'ip_abertura', rotulo: 'IP de abertura', tipo: 'texto', grupo: T_CONTATO },
      { nome: 'email_tecnico', rotulo: 'E-mail do técnico', tipo: 'email', grupo: T_CONTATO },
      { nome: 'fechado_por_email', rotulo: 'Fechado por (e-mail)', tipo: 'email', grupo: T_CONTATO },
      { nome: 'escalado_por_email', rotulo: 'Escalado por (e-mail)', tipo: 'email', grupo: T_CONTATO },
    ],
  },
  padroes: { sistema_origem: 'TI', status_normalizado: 'ABERTO', elegivel_sla: 'true', dado_teste: 'false' },
  rotuloRegistro: (r) => `Chamado de TI ${r.numero}`,
}

const janelaProgramada: EntidadeDef = {
  chave: 'ti_janela_programada', tabela: 'ti_janela_programada', area: 'TI', secao: 'disponibilidade',
  titulo: 'Janela programada por sistema', singular: 'janela programada', rota: '/ti/disponibilidade', segmento: 'janelas',
  descricao: 'Minutos de operação programados no mês (denominador da disponibilidade).',
  campos: [
    competenciaCampo(),
    ref('sistema_id', 'Sistema', 'ti_sistema', { obrigatorio: true, lista: true, grade: true }),
    { nome: 'minutos_programados', rotulo: 'Minutos programados', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
  ],
  schema: TI.janelaProgramadaSchema as z.ZodType<Dados>,
  ordem: '(select s.nome from ti_sistema s where s.id = t.sistema_id), t.id',
  busca: [],
  filtros: ['sistema_id'],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia', 'sistema_id'], campo: 'sistema_id', mensagem: () => 'Já existe janela para este sistema nesta competência.' },
  controle: FISICO,
  rotuloRegistro: (r) => `Janela programada #${r.id}`,
}

const indisponibilidade: EntidadeDef = {
  chave: 'ti_indisponibilidade', tabela: 'ti_indisponibilidade', area: 'TI', secao: 'disponibilidade',
  titulo: 'Indisponibilidades', singular: 'indisponibilidade', rota: '/ti/disponibilidade', segmento: 'indisponibilidades',
  campos: [
    competenciaCampo('Mês do início; se vazio, é derivada do início.'),
    ref('sistema_id', 'Sistema', 'ti_sistema', { obrigatorio: true, lista: true, grade: true }),
    { nome: 'inicio', rotulo: 'Início', tipo: 'dataHora', obrigatorio: true, lista: true, grade: true },
    { nome: 'fim', rotulo: 'Fim', tipo: 'dataHora', lista: true, grade: true, ajuda: 'Vazio = ainda indisponível.' },
    { nome: 'planejada', rotulo: 'Planejada', tipo: 'bool', lista: true, grade: true },
    { nome: 'valida', rotulo: 'Válida (conta na disponibilidade)', tipo: 'bool', lista: true, grade: true },
    { nome: 'motivo_invalidacao', rotulo: 'Motivo da invalidação', tipo: 'texto', grade: true },
    { nome: 'causa', rotulo: 'Causa', tipo: 'texto', lista: true, grade: true, largo: true },
    { nome: 'chamado_ti_numero', rotulo: 'Nº do chamado de TI', tipo: 'texto', virtual: true, grade: true },
    { nome: 'chamado_ti_id', rotulo: 'Chamado de TI', tipo: 'inteiro', oculto: true },
  ],
  schema: TI.indisponibilidadeSchema as z.ZodType<Dados>,
  ordem: 't.inicio desc, t.id desc',
  busca: ['t.causa', 't.motivo_invalidacao'],
  filtros: ['sistema_id', 'planejada', 'valida'],
  competenciaDerivada: true,
  dataEvento: (d) => dl(d.inicio),
  controle: { versao: true, atualizado: false, exclusao: 'simples', origem: true },
  vinculos: [{ campoNumero: 'chamado_ti_numero', coluna: 'chamado_ti_id', tabela: 'chamado_ti', rotulo: 'Chamado de TI', rotaRegistro: '/ti/chamados' }],
  calculadas: [{ nome: 'duracao_min', rotulo: 'Duração (min)', tipo: 'inteiro', sql: `case when t.fim is not null then round(extract(epoch from t.fim - t.inicio) / 60)::int end` }],
  padroes: { planejada: 'false', valida: 'true' },
  rotuloRegistro: (r) => `Indisponibilidade #${r.id}`,
}

const backup: EntidadeDef = {
  chave: 'ti_backup_execucao', tabela: 'ti_backup_execucao', area: 'TI', secao: 'continuidade',
  titulo: 'Execuções de backup', singular: 'execução de backup', rota: '/ti/continuidade', segmento: 'backups',
  campos: [
    competenciaCampo('Mês da data; se vazio, é derivada da data.'),
    { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    { nome: 'rotina', rotulo: 'Rotina', tipo: 'texto', obrigatorio: true, lista: true, grade: true },
    ref('sistema_id', 'Sistema', 'ti_sistema', { lista: true, grade: true }),
    { nome: 'programado', rotulo: 'Programado', tipo: 'bool', lista: true, grade: true },
    { nome: 'concluido', rotulo: 'Concluído com sucesso', tipo: 'bool', obrigatorio: true, lista: true, grade: true },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'texto', grade: true, largo: true },
  ],
  schema: TI.backupExecucaoSchema as z.ZodType<Dados>,
  ordem: 't.data desc, t.rotina',
  busca: ['t.rotina', 't.observacao'],
  filtros: ['sistema_id', 'concluido', 'programado'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data),
  chaveNegocio: { colunas: ['data', 'rotina'], campo: 'rotina', mensagem: (d) => `Já existe execução da rotina "${d.rotina}" nesta data.` },
  controle: SIMPLES,
  padroes: { programado: 'true' },
  rotuloRegistro: (r) => `Backup ${r.rotina}`,
}

const restauracao: EntidadeDef = {
  chave: 'ti_teste_restauracao', tabela: 'ti_teste_restauracao', area: 'TI', secao: 'continuidade',
  titulo: 'Testes de restauração', singular: 'teste de restauração', rota: '/ti/continuidade', segmento: 'restauracoes',
  campos: [
    competenciaCampo('Mês da data; se vazio, é derivada da data.'),
    { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    ref('sistema_id', 'Sistema', 'ti_sistema', { lista: true, grade: true }),
    { nome: 'rotina', rotulo: 'Rotina', tipo: 'texto', obrigatorio: true, lista: true, grade: true },
    { nome: 'sucesso', rotulo: 'Sucesso', tipo: 'bool', obrigatorio: true, lista: true, grade: true },
    { nome: 'tempo_restauracao_min', rotulo: 'Tempo de restauração (min)', tipo: 'inteiro', lista: true, grade: true },
    { nome: 'evidencia', rotulo: 'Evidência', tipo: 'texto', grade: true, largo: true, ajuda: 'Descreva a evidência; anexe arquivos no detalhe.' },
  ],
  schema: TI.testeRestauracaoSchema as z.ZodType<Dados>,
  ordem: 't.data desc, t.id desc',
  busca: ['t.rotina', 't.evidencia'],
  filtros: ['sistema_id', 'sucesso'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data),
  controle: SIMPLES,
  anexos: true,
  rotuloRegistro: (r) => `Teste de restauração — ${r.rotina}`,
}

const incidente: EntidadeDef = {
  chave: 'ti_incidente_critico', tabela: 'ti_incidente_critico', area: 'TI', secao: 'incidentes',
  titulo: 'Incidentes críticos (P1 e segurança)', singular: 'incidente crítico', rota: '/ti/incidentes',
  descricao: 'Status "Causa tratada" exige causa raiz, ação corretiva e responsável.',
  campos: [
    { nome: 'numero', rotulo: 'Número', tipo: 'texto', lista: true, grade: true },
    competenciaCampo('Mês da abertura; se vazio, é derivada da abertura.'),
    ref('sistema_id', 'Sistema', 'ti_sistema', { lista: true, grade: true }),
    { nome: 'seguranca', rotulo: 'Incidente de segurança', tipo: 'bool', lista: true, grade: true },
    en('status', 'Status', TI.STATUS_INCIDENTE, TI.ROTULOS_STATUS_INCIDENTE, { obrigatorio: true, lista: true, grade: true }),
    { nome: 'aberto_em', rotulo: 'Abertura', tipo: 'dataHora', obrigatorio: true, lista: true, grade: true },
    { nome: 'resolvido_em', rotulo: 'Resolução', tipo: 'dataHora', lista: true, grade: true },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'textoLongo', obrigatorio: true, largo: true, grade: true },
    { nome: 'causa_raiz', rotulo: 'Causa raiz', tipo: 'textoLongo', grade: true },
    { nome: 'acao_corretiva', rotulo: 'Ação corretiva', tipo: 'textoLongo', grade: true },
    { nome: 'responsavel', rotulo: 'Responsável pela ação', tipo: 'texto', lista: true, grade: true },
    { nome: 'prazo_acao', rotulo: 'Prazo da ação', tipo: 'data', grade: true },
  ],
  schema: TI.incidenteCriticoSchema as z.ZodType<Dados>,
  ordem: 't.aberto_em desc, t.id desc',
  busca: ['t.numero', 't.descricao', 't.causa_raiz', 't.responsavel'],
  filtros: ['status', 'sistema_id', 'seguranca'],
  competenciaDerivada: true,
  dataEvento: (d) => dl(d.aberto_em),
  controle: SIMPLES,
  anexos: true,
  padroes: { status: 'ABERTO', seguranca: 'false' },
  rotuloRegistro: (r) => `Incidente ${r.numero ?? `#${r.id}`}`,
}

const projeto: EntidadeDef = {
  chave: 'ti_projeto', tabela: 'ti_projeto', area: 'TI', secao: 'projetos',
  titulo: 'Projetos', singular: 'projeto', rota: '/ti/projetos', segmento: 'projetos',
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, lista: true, grade: true, largo: true },
    { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto', lista: true, grade: true },
    en('status', 'Status', TI.STATUS_PROJETO, TI.ROTULOS_STATUS_PROJETO, { obrigatorio: true, lista: true, grade: true }),
    { nome: 'roadmap_aprovado', rotulo: 'No roadmap aprovado', tipo: 'bool', lista: true, grade: true },
    { nome: 'inicio', rotulo: 'Início', tipo: 'data', lista: true, grade: true },
    { nome: 'fim_previsto', rotulo: 'Fim previsto', tipo: 'data', lista: true, grade: true },
  ],
  schema: TI.projetoSchema as z.ZodType<Dados>,
  ordem: 't.inicio desc nulls last, t.id desc',
  busca: ['t.nome', 't.responsavel'],
  filtros: ['status', 'roadmap_aprovado'],
  semCompetencia: true,
  competenciaDerivada: false,
  dataEvento: () => null,
  controle: SIMPLES,
  calculadas: [
    { nome: 'marcos', rotulo: 'Marcos', tipo: 'inteiro', sql: '(select count(*)::int from ti_marco m where m.projeto_id = t.id and m.excluido_em is null)' },
    { nome: 'marcos_atrasados', rotulo: 'Marcos em atraso', tipo: 'inteiro', sql: `(select count(*)::int from ti_marco m where m.projeto_id = t.id and m.excluido_em is null and coalesce(m.data_realizada, current_date) > m.data_planejada)` },
  ],
  padroes: { status: 'EM_ANDAMENTO', roadmap_aprovado: 'false' },
  rotuloRegistro: (r) => `Projeto ${r.nome}`,
}

const marco: EntidadeDef = {
  chave: 'ti_marco', tabela: 'ti_marco', area: 'TI', secao: 'projetos',
  titulo: 'Marcos de entrega', singular: 'marco', rota: '/ti/projetos', segmento: 'marcos',
  descricao: 'A competência do marco é o mês da data planejada. Desvio = dias entre o planejado e o realizado (ou hoje, se pendente).',
  campos: [
    ref('projeto_id', 'Projeto', 'ti_projeto', { obrigatorio: true, lista: true, grade: true }),
    competenciaCampo('Mês da data planejada; se vazio, é derivada dela.'),
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, lista: true, grade: true, largo: true },
    { nome: 'data_planejada', rotulo: 'Data planejada', tipo: 'data', obrigatorio: true, lista: true, grade: true },
    { nome: 'data_realizada', rotulo: 'Data realizada', tipo: 'data', lista: true, grade: true },
    { nome: 'percentual_concluido', rotulo: '% concluído', tipo: 'decimal', lista: true, grade: true },
    { nome: 'observacao_desvio', rotulo: 'Observação do desvio', tipo: 'texto', grade: true, ajuda: 'Obrigatória quando entregue com atraso.' },
  ],
  schema: TI.marcoSchema as z.ZodType<Dados>,
  ordem: 't.data_planejada, t.id',
  busca: ['t.descricao', `(select p.nome from ti_projeto p where p.id = t.projeto_id)`],
  filtros: ['projeto_id'],
  competenciaDerivada: true,
  dataEvento: (d) => s(d.data_planejada),
  controle: SIMPLES,
  calculadas: [{
    nome: 'desvio_dias', rotulo: 'Desvio (dias)', tipo: 'inteiro',
    sql: `(coalesce(t.data_realizada, greatest((now() at time zone 'America/Sao_Paulo')::date, t.data_planejada)) - t.data_planejada)`,
  }],
  padroes: { percentual_concluido: '0' },
  rotuloRegistro: (r) => `Marco — ${r.descricao}`,
}

const patch: EntidadeDef = {
  chave: 'ti_patch_ciclo', tabela: 'ti_patch_ciclo', area: 'TI', secao: 'patches',
  titulo: 'Ciclo mensal de patches críticos', singular: 'ciclo de patches', rota: '/ti/patches',
  descricao: 'Um registro por competência: patches críticos liberados e quantos foram aplicados em até 30 dias.',
  campos: [
    competenciaCampo(),
    { nome: 'patches_criticos_liberados', rotulo: 'Patches críticos liberados', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
    { nome: 'aplicados_ate_30_dias', rotulo: 'Aplicados em até 30 dias', tipo: 'inteiro', obrigatorio: true, lista: true, grade: true },
  ],
  schema: TI.patchCicloSchema as z.ZodType<Dados>,
  ordem: 't.competencia desc',
  busca: [],
  filtros: [],
  competenciaDerivada: false,
  dataEvento: (d) => s(d.competencia),
  chaveNegocio: { colunas: ['competencia'], campo: 'competencia', mensagem: () => 'Já existe o ciclo de patches desta competência.' },
  controle: FISICO,
  calculadas: [{
    nome: 'percentual', rotulo: '% aplicado em 30 dias', tipo: 'decimal',
    sql: `case when t.patches_criticos_liberados > 0 then round(100.0 * t.aplicados_ate_30_dias / t.patches_criticos_liberados, 1) end`,
  }],
  rotuloRegistro: (r) => `Patches ${String(r.competencia).slice(5, 7)}/${String(r.competencia).slice(0, 4)}`,
}

export const ENTIDADES = {
  manut_interna: manutInterna,
  manut_preventiva_plano: preventivaPlano,
  chamado_externo: chamadoExterno,
  solicitacao_troca: solicitacaoTroca,
  movimento_estoque: movimentoEstoque,
  comodato_movimento: comodatoMovimento,
  comodato_posicao: comodatoPosicao,
  comodato_base_ativa: comodatoBase,
  comodato_consumo: comodatoConsumo,
  chamado_ti: chamadoTi,
  ti_janela_programada: janelaProgramada,
  ti_indisponibilidade: indisponibilidade,
  ti_backup_execucao: backup,
  ti_teste_restauracao: restauracao,
  ti_incidente_critico: incidente,
  ti_projeto: projeto,
  ti_marco: marco,
  ti_patch_ciclo: patch,
} satisfies Record<string, EntidadeDef>

export type ChaveEntidade = keyof typeof ENTIDADES

export function entidade(chave: string): EntidadeDef {
  const d = (ENTIDADES as Record<string, EntidadeDef>)[chave]
  if (!d) throw new Error(`Entidade desconhecida: ${chave}`)
  return d
}
export const ehEntidade = (chave: string): chave is ChaveEntidade => Object.hasOwn(ENTIDADES, chave)

/** Entidade de uma página agregadora pelo segmento (?ent= ou /[ent]/...). */
export function entidadePorSegmento(rota: string, segmento: string | undefined): EntidadeDef | null {
  const lista = Object.values(ENTIDADES as Record<string, EntidadeDef>).filter((d) => d.rota === rota)
  if (!segmento) return lista[0] ?? null
  return lista.find((d) => d.segmento === segmento) ?? null
}
export const entidadesDaRota = (rota: string) => Object.values(ENTIDADES as Record<string, EntidadeDef>).filter((d) => d.rota === rota)

/** URL da listagem e base das páginas de registro. */
export const urlLista = (d: EntidadeDef) => (d.segmento ? `${d.rota}?ent=${d.segmento}` : d.rota)
export const urlRegistro = (d: EntidadeDef) => (d.segmento ? `${d.rota}/${d.segmento}` : d.rota)

/** Todos os campos editáveis (principais + restritos). */
export const camposEditaveis = (d: EntidadeDef, restritos: boolean) =>
  [...d.campos.filter((c) => !c.oculto), ...(restritos && d.restrito ? d.restrito.campos : [])]
/** Colunas gravadas na tabela principal. */
export const colunasTabela = (d: EntidadeDef) => d.campos.filter((c) => !c.virtual).map((c) => c.nome)
