/**
 * Camada única de séries mensais. Painéis, indicadores e os três exportadores (Excel, PDF,
 * PowerPoint) leem daqui — por isso os números são idênticos em todos os canais.
 *
 * Fonte por competência:
 *  - antes da data de corte da migração: histórico migrado da planilha (historico_agregado), quando existir;
 *  - demais casos: eventos lançados no sistema.
 * Ausência de dado nunca vira zero: uma competência sem nenhum lançamento na área e ainda não
 * validada pelo gestor é "não informada".
 */
import { q, type Db, pool } from '@/lib/db'
import type { AreaCodigo } from '@/lib/auth/permissoes'

export type Dimensao =
  | 'FAMILIA_EQUIP' | 'TECNICO' | 'REDE' | 'CLIENTE' | 'FAMILIA_PECA' | 'MOTIVO'
  | 'STATUS' | 'CATEGORIA' | 'PRIORIDADE' | 'SISTEMA_ORIGEM' | 'TIPO'

export type SerieCodigo =
  | 'MI_RECUPERADOS' | 'MI_SUCATEADOS' | 'MI_LAVAGENS' | 'MI_PECAS_QTD'
  | 'ME_ATENDIMENTOS' | 'ME_REINCIDENCIAS' | 'ME_CHAMADOS' | 'ME_NECESSARIOS' | 'ME_DESNECESSARIOS'
  | 'ME_EQUIP_CLIENTE_QTD' | 'ME_EQUIP_CLIENTE_VALOR' | 'ME_TROCAS_QTD' | 'ME_PECAS_QTD'
  | 'EP_ENTRADA_RS' | 'EP_SAIDA_RS'
  | 'CO_ENTREGAS' | 'CO_TROCAS' | 'CO_RETIRADAS' | 'CO_SEM_EXITO' | 'CO_FIM_ANO'
  | 'TI_ABERTOS' | 'TI_RESOLVIDOS' | 'TI_CANCELADOS'

export type Fonte = 'EVENTOS' | 'HISTORICO'
export type SituacaoMes = 'OK' | 'NAO_INFORMADO'

export interface PontoSerie { competencia: string; dimensao: string | null; valor: number }
export interface ResultadoSerie {
  codigo: SerieCodigo
  pontos: PontoSerie[]
  porMes: Record<string, { valor: number | null; fonte: Fonte; situacao: SituacaoMes }>
}

interface DefSerie {
  area: AreaCodigo
  nome: string
  unidade: 'qtd' | 'R$'
  /** série histórica por dimensão (null = total/sem dimensão) */
  historico: Partial<Record<Dimensao | 'TOTAL', string>>
  dimensoes: Dimensao[]
  /** SQL de eventos: deve retornar (competencia, dimensao, valor); $1 = competências */
  eventos: (dim: Dimensao | null) => string
}

const dimSql: Record<string, { join: string; expr: string }> = {
  FAMILIA_EQUIP: { join: 'left join familia_equipamento fe on fe.id = t.familia_id', expr: `coalesce(fe.nome, 'Não informado')` },
  TECNICO: { join: 'left join tecnico tc on tc.id = t.tecnico_id', expr: `coalesce(tc.nome, 'Não informado')` },
  CLIENTE: { join: 'left join cliente cl on cl.id = t.cliente_id', expr: `coalesce(cl.fantasia, 'Não informado')` },
  REDE: { join: 'left join cliente cl on cl.id = t.cliente_id left join rede rd on rd.id = cl.rede_id', expr: `coalesce(rd.nome, 'Sem rede')` },
  FAMILIA_PECA: { join: 'left join familia_peca fp on fp.id = t.familia_id', expr: `coalesce(fp.nome, 'Não informado')` },
  MOTIVO: { join: '', expr: `coalesce(t.motivo_desnecessario, 'Não classificado')` },
}

function sqlEventos(tabela: string, filtro: string, dim: Dimensao | null, agregado = 'count(*)', joinsExtras = '') {
  const d = dim ? dimSql[dim] : null
  return `select t.competencia::text as competencia, ${d ? d.expr : 'null'} as dimensao, ${agregado}::float8 as valor
            from ${tabela} t ${joinsExtras} ${d?.join ?? ''}
           where t.competencia = any($1::date[]) and ${filtro}
           group by 1, 2`
}

const SERIES: Record<SerieCodigo, DefSerie> = {
  MI_RECUPERADOS: {
    area: 'MANUT_INTERNA', nome: 'Recuperações na oficina', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP', 'TECNICO'],
    historico: { TOTAL: 'MI_RECUPERADOS', FAMILIA_EQUIP: 'MI_RECUPERADOS' },
    eventos: (d) => sqlEventos('manut_interna', `t.excluido_em is null and t.resultado = 'RECUPERADO'`, d),
  },
  MI_SUCATEADOS: {
    area: 'MANUT_INTERNA', nome: 'Equipamentos sucateados', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP', 'TECNICO'],
    historico: { TOTAL: 'MI_SUCATEADOS', FAMILIA_EQUIP: 'MI_SUCATEADOS' },
    eventos: (d) => sqlEventos('manut_interna', `t.excluido_em is null and t.resultado = 'SUCATEADO'`, d),
  },
  MI_LAVAGENS: {
    area: 'MANUT_INTERNA', nome: 'Lavagens/higienizações', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP'],
    historico: { TOTAL: 'MI_LAVAGENS', FAMILIA_EQUIP: 'MI_LAVAGENS' },
    eventos: (d) => sqlEventos('manut_interna', `t.excluido_em is null and (t.resultado = 'HIGIENIZADO' or t.tipo_servico = 'HIGIENIZACAO')`, d),
  },
  MI_PECAS_QTD: {
    area: 'MANUT_INTERNA', nome: 'Peças utilizadas internamente', unidade: 'qtd', dimensoes: ['FAMILIA_PECA'],
    historico: { TOTAL: 'MI_PECAS_QTD', FAMILIA_PECA: 'MI_PECAS_QTD' },
    eventos: (d) => sqlEventos('movimento_estoque', `t.excluido_em is null and t.tipo = 'SAIDA' and t.aplicacao = 'INTERNA'`, d, 'sum(t.quantidade)'),
  },
  ME_ATENDIMENTOS: {
    area: 'MANUT_EXTERNA', nome: 'Atendimentos externos realizados', unidade: 'qtd', dimensoes: ['TECNICO', 'FAMILIA_EQUIP'],
    historico: { TOTAL: 'ME_ATENDIMENTOS', TECNICO: 'ME_ATENDIMENTOS' },
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status = 'ENCERRADO'`, d),
  },
  ME_REINCIDENCIAS: {
    area: 'MANUT_EXTERNA', nome: 'Reincidências', unidade: 'qtd', dimensoes: ['TECNICO', 'FAMILIA_EQUIP', 'CLIENTE'],
    historico: { TOTAL: 'ME_REINCIDENCIAS', TECNICO: 'ME_REINCIDENCIAS' },
    // A reincidência é atribuída ao técnico do atendimento anterior (o que retornou).
    eventos: (d) => {
      const joinAnt = 'join chamado_externo ant on ant.id = t.chamado_anterior_id'
      const janela = `(nullif((select valor #>> '{}' from configuracao where chave = 'manut_externa.janela_reincidencia_dias'), 'null') is null
          or t.aberto_em <= coalesce(ant.encerrado_em, ant.aberto_em) + ((select (valor #>> '{}')::int from configuracao where chave = 'manut_externa.janela_reincidencia_dias') || ' days')::interval)`
      const filtro = `t.excluido_em is null and t.status <> 'CANCELADO' and ${janela}`
      if (d === 'TECNICO') {
        return `select t.competencia::text as competencia, coalesce(tc.nome, 'Não informado') as dimensao, count(*)::float8 as valor
                  from chamado_externo t ${joinAnt} left join tecnico tc on tc.id = ant.tecnico_id
                 where t.competencia = any($1::date[]) and ${filtro} group by 1, 2`
      }
      return sqlEventos('chamado_externo', filtro, d, 'count(*)', joinAnt)
    },
  },
  ME_CHAMADOS: {
    area: 'MANUT_EXTERNA', nome: 'Chamados externos', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP', 'REDE', 'CLIENTE', 'TECNICO'],
    historico: { TOTAL: 'ME_CHAMADOS', FAMILIA_EQUIP: 'ME_CHAMADOS', REDE: 'ME_CHAMADOS_REDE', CLIENTE: 'ME_CHAMADOS_CLIENTE' },
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status <> 'CANCELADO'`, d),
  },
  ME_NECESSARIOS: {
    area: 'MANUT_EXTERNA', nome: 'Chamados necessários', unidade: 'qtd', dimensoes: [],
    historico: { TOTAL: 'ME_NECESSARIOS' },
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status <> 'CANCELADO' and t.necessario is true`, d),
  },
  ME_DESNECESSARIOS: {
    area: 'MANUT_EXTERNA', nome: 'Chamados desnecessários', unidade: 'qtd', dimensoes: ['CLIENTE', 'MOTIVO', 'FAMILIA_EQUIP'],
    historico: { TOTAL: 'ME_DESNECESSARIOS' },
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status <> 'CANCELADO' and t.necessario is false`, d),
  },
  ME_EQUIP_CLIENTE_QTD: {
    area: 'MANUT_EXTERNA', nome: 'Manutenções em equipamento do cliente', unidade: 'qtd', dimensoes: [],
    historico: { TOTAL: 'ME_EQUIP_CLIENTE_QTD' },
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status <> 'CANCELADO' and t.equipamento_do_cliente`, d),
  },
  ME_EQUIP_CLIENTE_VALOR: {
    area: 'MANUT_EXTERNA', nome: 'Valor em equipamento do cliente', unidade: 'R$', dimensoes: [],
    historico: {},
    eventos: (d) => sqlEventos('chamado_externo', `t.excluido_em is null and t.status <> 'CANCELADO' and t.equipamento_do_cliente`, d, 'coalesce(sum(t.valor_cobrado),0)'),
  },
  ME_TROCAS_QTD: {
    area: 'MANUT_EXTERNA', nome: 'Trocas solicitadas pela manutenção', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP'],
    historico: { TOTAL: 'ME_TROCAS_QTD' },
    eventos: (d) => sqlEventos('solicitacao_troca', `t.excluido_em is null and t.status <> 'CANCELADA'`, d),
  },
  ME_PECAS_QTD: {
    area: 'MANUT_EXTERNA', nome: 'Peças utilizadas externamente', unidade: 'qtd', dimensoes: ['FAMILIA_PECA'],
    historico: { TOTAL: 'ME_PECAS_QTD', FAMILIA_PECA: 'ME_PECAS_QTD' },
    eventos: (d) => sqlEventos('movimento_estoque', `t.excluido_em is null and t.tipo = 'SAIDA' and t.aplicacao = 'EXTERNA'`, d, 'sum(t.quantidade)'),
  },
  EP_ENTRADA_RS: {
    area: 'ESTOQUE_PECAS', nome: 'Entradas de estoque (R$)', unidade: 'R$', dimensoes: ['FAMILIA_PECA'],
    historico: { TOTAL: 'EP_ENTRADA_RS', FAMILIA_PECA: 'EP_ENTRADA_RS' },
    eventos: (d) => sqlEventos('movimento_estoque', `t.excluido_em is null and t.tipo = 'ENTRADA'`, d, 'coalesce(sum(t.valor_total),0)'),
  },
  EP_SAIDA_RS: {
    area: 'ESTOQUE_PECAS', nome: 'Saídas de estoque (R$)', unidade: 'R$', dimensoes: ['FAMILIA_PECA'],
    historico: { TOTAL: 'EP_SAIDA_RS', FAMILIA_PECA: 'EP_SAIDA_RS' },
    eventos: (d) => sqlEventos('movimento_estoque', `t.excluido_em is null and t.tipo = 'SAIDA'`, d, 'coalesce(sum(t.valor_total),0)'),
  },
  CO_ENTREGAS: {
    area: 'COMODATO', nome: 'Entregas', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP'],
    historico: { TOTAL: 'CO_ENTREGAS' },
    eventos: (d) => sqlEventos('comodato_movimento', `t.excluido_em is null and t.situacao = 'CONCLUIDO' and t.tipo = 'ENTREGA' and not t.campanha_fim_ano`, d),
  },
  CO_TROCAS: {
    area: 'COMODATO', nome: 'Trocas', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP'],
    historico: { TOTAL: 'CO_TROCAS' },
    eventos: (d) => sqlEventos('comodato_movimento', `t.excluido_em is null and t.situacao = 'CONCLUIDO' and t.tipo = 'TROCA' and not t.campanha_fim_ano`, d),
  },
  CO_RETIRADAS: {
    area: 'COMODATO', nome: 'Retiradas', unidade: 'qtd', dimensoes: ['FAMILIA_EQUIP'],
    historico: { TOTAL: 'CO_RETIRADAS' },
    eventos: (d) => sqlEventos('comodato_movimento', `t.excluido_em is null and t.situacao = 'CONCLUIDO' and t.tipo = 'RETIRADA' and not t.campanha_fim_ano`, d),
  },
  CO_FIM_ANO: {
    area: 'COMODATO', nome: 'Entregas/retiradas de fim de ano', unidade: 'qtd', dimensoes: [],
    historico: { TOTAL: 'CO_FIM_ANO' },
    eventos: (d) => sqlEventos('comodato_movimento', `t.excluido_em is null and t.situacao = 'CONCLUIDO' and t.campanha_fim_ano`, d),
  },
  CO_SEM_EXITO: {
    area: 'COMODATO', nome: 'Tentativas sem êxito', unidade: 'qtd', dimensoes: [],
    historico: { TOTAL: 'CO_SEM_EXITO' },
    eventos: (d) => sqlEventos('comodato_tentativa', `not t.sucesso`, d),
  },
  TI_ABERTOS: {
    area: 'TI', nome: 'Chamados de TI abertos', unidade: 'qtd', dimensoes: ['STATUS', 'CATEGORIA', 'PRIORIDADE', 'SISTEMA_ORIGEM', 'TIPO'],
    historico: {},
    eventos: (d) => tiSql(`true`, d),
  },
  TI_RESOLVIDOS: {
    area: 'TI', nome: 'Chamados de TI resolvidos', unidade: 'qtd', dimensoes: ['CATEGORIA', 'PRIORIDADE', 'SISTEMA_ORIGEM'],
    historico: {},
    eventos: (d) => tiSql(`t.status_normalizado = 'RESOLVIDO'`, d),
  },
  TI_CANCELADOS: {
    area: 'TI', nome: 'Chamados de TI cancelados', unidade: 'qtd', dimensoes: ['SISTEMA_ORIGEM'],
    historico: {},
    eventos: (d) => tiSql(`t.status_normalizado = 'CANCELADO'`, d),
  },
}

function tiSql(filtro: string, d: Dimensao | null) {
  const expr: Record<string, string> = {
    STATUS: `t.status`, CATEGORIA: `coalesce(nullif(t.categoria,''), 'Não informado')`,
    PRIORIDADE: `coalesce(nullif(t.prioridade,''), 'Não informado')`, SISTEMA_ORIGEM: `t.sistema_origem`, TIPO: `coalesce(nullif(t.tipo,''), 'Não informado')`,
  }
  return `select t.competencia::text as competencia, ${d ? expr[d] : 'null'} as dimensao, count(*)::float8 as valor
            from chamado_ti t where t.competencia = any($1::date[]) and t.excluido_em is null and not t.dado_teste and ${filtro}
           group by 1, 2`
}

export const definicaoSerie = (c: SerieCodigo) => SERIES[c]
export const codigosSeries = Object.keys(SERIES) as SerieCodigo[]

/* ------------------------------------------------------------------ */

export async function dataCorteMigracao(db: Db = pool()): Promise<string> {
  const r = await q<{ v: string }>(`select valor #>> '{}' as v from configuracao where chave = 'migracao.data_corte'`, [], db)
  return r[0]?.v ?? '2026-09-01'
}

const TABELAS_AREA: Record<AreaCodigo, string[]> = {
  MANUT_INTERNA: ['manut_interna'],
  MANUT_EXTERNA: ['chamado_externo', 'solicitacao_troca'],
  ESTOQUE_PECAS: ['movimento_estoque'],
  COMODATO: ['comodato_movimento', 'comodato_posicao', 'comodato_base_ativa'],
  TI: ['chamado_ti'],
}

/**
 * Competências em que a área possui lançamentos no sistema ou foi validada pelo gestor
 * (EM_VALIDACAO/APROVADO/FECHADO): nessas, contagem zero é zero real.
 */
export async function competenciasInformadas(area: AreaCodigo, meses: string[], db: Db = pool()): Promise<Set<string>> {
  const partes = TABELAS_AREA[area].map((t) => `select distinct competencia::text as c from ${t} where competencia = any($1::date[]) and excluido_em is null`)
  partes.push(`select competencia::text from periodo_area where area_codigo = $2 and competencia = any($1::date[]) and status in ('EM_VALIDACAO','APROVADO','FECHADO')`)
  const rows = await q<{ c: string }>(partes.join(' union '), [meses, area], db)
  return new Set(rows.map((r) => r.c))
}

export async function lerSerie(codigo: SerieCodigo, meses: string[], dimensao: Dimensao | null = null, db: Db = pool()): Promise<ResultadoSerie> {
  const def = SERIES[codigo]
  if (dimensao && !def.dimensoes.includes(dimensao)) throw new Error(`Série ${codigo} não suporta a dimensão ${dimensao}`)
  const corte = await dataCorteMigracao(db)
  const serieHist = def.historico[dimensao ?? 'TOTAL'] ?? null
  const serieHistTotal = def.historico.TOTAL ?? null

  // Meses que usarão histórico: anteriores ao corte e com dados migrados da série TOTAL
  const mesesAntes = meses.filter((m) => m < corte)
  let mesesHist = new Set<string>()
  if (serieHistTotal && mesesAntes.length) {
    const r = await q<{ c: string }>(`select distinct competencia::text as c from historico_agregado where serie = $1 and competencia = any($2::date[])`, [serieHistTotal, mesesAntes], db)
    mesesHist = new Set(r.map((x) => x.c))
  }
  const mesesEvt = meses.filter((m) => !mesesHist.has(m))
  const pontos: PontoSerie[] = []

  if (mesesHist.size) {
    if (serieHist) {
      const nomeDim = dimensao === 'FAMILIA_EQUIP' ? `coalesce((select nome from familia_equipamento where id = h.dimensao_id), h.dimensao_valor)`
        : dimensao === 'FAMILIA_PECA' ? `coalesce((select nome from familia_peca where id = h.dimensao_id), h.dimensao_valor)`
        : dimensao === 'TECNICO' ? `coalesce((select nome from tecnico where id = h.dimensao_id), h.dimensao_valor)`
        : dimensao === 'REDE' ? `coalesce((select nome from rede where id = h.dimensao_id), h.dimensao_valor)`
        : dimensao ? 'h.dimensao_valor' : 'null'
      const rows = await q<PontoSerie>(
        `select h.competencia::text as competencia, ${nomeDim} as dimensao, sum(h.valor)::float8 as valor
           from historico_agregado h where h.serie = $1 and h.competencia = any($2::date[]) group by 1, 2`,
        [serieHist, [...mesesHist]], db)
      pontos.push(...rows)
    }
  }
  const informados = await competenciasInformadas(def.area, mesesEvt.length ? mesesEvt : ['1900-01-01'], db)
  if (mesesEvt.length) {
    const rows = await q<PontoSerie>(def.eventos(dimensao), [mesesEvt], db)
    pontos.push(...rows)
  }

  // Totais por mês (sempre a partir da série TOTAL para histórico, para não depender da dimensão)
  const porMes: ResultadoSerie['porMes'] = {}
  let totaisHist = new Map<string, number>()
  if (mesesHist.size && serieHistTotal) {
    const r = await q<{ c: string; v: number }>(`select competencia::text as c, sum(valor)::float8 as v from historico_agregado where serie = $1 and competencia = any($2::date[]) group by 1`, [serieHistTotal, [...mesesHist]], db)
    totaisHist = new Map(r.map((x) => [x.c, x.v]))
  }
  for (const m of meses) {
    if (mesesHist.has(m)) {
      porMes[m] = { valor: totaisHist.get(m) ?? null, fonte: 'HISTORICO', situacao: 'OK' }
    } else {
      const soma = pontos.filter((p) => p.competencia === m).reduce((s, p) => s + p.valor, 0)
      const ok = informados.has(m)
      porMes[m] = { valor: ok ? soma : null, fonte: 'EVENTOS', situacao: ok ? 'OK' : 'NAO_INFORMADO' }
    }
  }
  // Séries dimensionais sem histórico dimensional: não inventa distribuição
  const pontosValidos = pontos.filter((p) => porMes[p.competencia]?.situacao === 'OK')
  return { codigo, pontos: pontosValidos, porMes }
}

/** Soma por dimensão no intervalo, ordenada desc (base do Pareto/ranking). */
export function totalPorDimensao(r: ResultadoSerie): { dimensao: string; valor: number }[] {
  const m = new Map<string, number>()
  for (const p of r.pontos) if (p.dimensao !== null) m.set(p.dimensao, (m.get(p.dimensao) ?? 0) + p.valor)
  return [...m.entries()].map(([dimensao, valor]) => ({ dimensao, valor })).sort((a, b) => b.valor - a.valor || a.dimensao.localeCompare(b.dimensao))
}

/** Pareto 80/20: acumulado percentual e marcação dos itens que compõem até 80%. */
export function pareto(itens: { dimensao: string; valor: number }[], corte = 80) {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  let acum = 0
  return itens.map((i) => {
    const antes = total ? (acum / total) * 100 : 0
    acum += i.valor
    const pct = total ? (acum / total) * 100 : 0
    return { ...i, participacao: total ? (i.valor / total) * 100 : 0, acumulado: pct, classeA: antes < corte }
  })
}
