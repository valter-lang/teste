/**
 * Fluxo mensal por área: RASCUNHO → EM_PREENCHIMENTO → EM_VALIDACAO → APROVADO → FECHADO.
 * Reabertura de APROVADO/FECHADO exige permissão e justificativa, registrando antes/depois.
 * Controle de concorrência otimista por periodo_area.versao.
 */
import { q, q1, tx, pool, type Db } from '@/lib/db'
import { pode, type Acao, type AreaCodigo, type UsuarioSessao, AcessoNegado, AREAS } from '@/lib/auth/permissoes'
import { ultimoDia } from '@/lib/competencia'
import { calcularPainel, type Resultado } from '@/lib/indicadores/motor'

export type StatusPeriodo = 'RASCUNHO' | 'EM_PREENCHIMENTO' | 'EM_VALIDACAO' | 'APROVADO' | 'FECHADO'
export type AcaoFechamento = 'INICIAR' | 'ENVIAR_VALIDACAO' | 'DEVOLVER' | 'APROVAR' | 'FECHAR' | 'REABRIR'

export const ROTULO_STATUS: Record<StatusPeriodo, string> = {
  RASCUNHO: 'Rascunho',
  EM_PREENCHIMENTO: 'Em preenchimento',
  EM_VALIDACAO: 'Em validação',
  APROVADO: 'Aprovado',
  FECHADO: 'Fechado',
}

const TRANSICOES: Record<AcaoFechamento, { de: StatusPeriodo[]; para: StatusPeriodo; permissao: Acao; exigeJustificativa?: boolean }> = {
  INICIAR: { de: ['RASCUNHO'], para: 'EM_PREENCHIMENTO', permissao: 'periodo.preencher' },
  ENVIAR_VALIDACAO: { de: ['EM_PREENCHIMENTO', 'RASCUNHO'], para: 'EM_VALIDACAO', permissao: 'periodo.enviar_validacao' },
  DEVOLVER: { de: ['EM_VALIDACAO'], para: 'EM_PREENCHIMENTO', permissao: 'periodo.devolver', exigeJustificativa: true },
  APROVAR: { de: ['EM_VALIDACAO'], para: 'APROVADO', permissao: 'periodo.aprovar' },
  FECHAR: { de: ['APROVADO'], para: 'FECHADO', permissao: 'periodo.fechar' },
  REABRIR: { de: ['APROVADO', 'FECHADO'], para: 'EM_PREENCHIMENTO', permissao: 'periodo.reabrir', exigeJustificativa: true },
}

export function acoesPossiveis(u: UsuarioSessao, area: string, status: StatusPeriodo): AcaoFechamento[] {
  return (Object.keys(TRANSICOES) as AcaoFechamento[]).filter((a) => TRANSICOES[a].de.includes(status) && pode(u, TRANSICOES[a].permissao, area))
}

export interface Periodo { id: number | null; competencia: string; area: AreaCodigo; status: StatusPeriodo; versao: number; atualizado_em: string | null; atualizado_por_nome: string | null }

export async function periodosDaCompetencia(comp: string, db: Db = pool()): Promise<Periodo[]> {
  const rows = await q<{ id: number; area_codigo: AreaCodigo; status: StatusPeriodo; versao: number; atualizado_em: string; nome: string | null }>(
    `select p.id, p.area_codigo, p.status, p.versao, p.atualizado_em::text, u.nome
       from periodo_area p left join usuario u on u.id = p.atualizado_por where p.competencia = $1`, [comp], db)
  return AREAS.map((a) => {
    const r = rows.find((x) => x.area_codigo === a.codigo)
    return { id: r?.id ?? null, competencia: comp, area: a.codigo, status: r?.status ?? 'RASCUNHO', versao: r?.versao ?? 0, atualizado_em: r?.atualizado_em ?? null, atualizado_por_nome: r?.nome ?? null }
  })
}

export async function areasObrigatorias(db: Db = pool()): Promise<string[]> {
  const r = await q1<{ valor: string[] }>(`select valor from configuracao where chave = 'fechamento.areas_obrigatorias'`, [], db)
  return r?.valor ?? AREAS.map((a) => a.codigo)
}

/** Selo do relatório consolidado: "Oficial" apenas com todas as áreas obrigatórias aprovadas/fechadas. */
export async function situacaoConsolidada(comp: string, db: Db = pool()): Promise<{ oficial: boolean; pendentes: string[] }> {
  const obrig = await areasObrigatorias(db)
  const per = await periodosDaCompetencia(comp, db)
  const pendentes = per.filter((p) => obrig.includes(p.area) && !['APROVADO', 'FECHADO'].includes(p.status)).map((p) => p.area)
  return { oficial: pendentes.length === 0, pendentes }
}

/* ------------------------------------------------------------------ checklist */

export interface ItemChecklist {
  chave: string
  descricao: string
  quantidade: number
  severidade: 'BLOQUEANTE' | 'ALERTA'
  link?: string
}

export async function checklist(area: AreaCodigo, comp: string, db: Db = pool()): Promise<ItemChecklist[]> {
  const itens: ItemChecklist[] = []
  const add = (chave: string, descricao: string, quantidade: number, severidade: ItemChecklist['severidade'], link?: string) => {
    if (quantidade > 0) itens.push({ chave, descricao, quantidade, severidade, link })
  }
  const cnt = async (sql: string, p: unknown[] = [comp]) => (await q1<{ n: number }>(sql, p, db))?.n ?? 0
  const fim = ultimoDia(comp)
  if (area === 'MANUT_INTERNA') {
    add('MI_PENDENTES', 'Equipamentos com resultado "Pendente" na competência', await cnt(`select count(*)::int n from manut_interna where competencia=$1 and excluido_em is null and resultado='PENDENTE'`), 'ALERTA', '/manutencao-interna/lancamentos')
    add('MI_SEM_TECNICO', 'Lançamentos sem técnico responsável', await cnt(`select count(*)::int n from manut_interna where competencia=$1 and excluido_em is null and tecnico_id is null`), 'ALERTA', '/manutencao-interna/lancamentos')
  }
  if (area === 'MANUT_EXTERNA') {
    add('ME_SEM_CLASSIFICACAO', 'Chamados encerrados sem classificação necessário/desnecessário (afeta o indicador)', await cnt(`select count(*)::int n from chamado_externo where competencia=$1 and excluido_em is null and status='ENCERRADO' and necessario is null`), 'BLOQUEANTE', '/manutencao-externa/chamados')
    add('ME_SEM_TECNICO', 'Chamados encerrados sem técnico', await cnt(`select count(*)::int n from chamado_externo where competencia=$1 and excluido_em is null and status='ENCERRADO' and tecnico_id is null`), 'BLOQUEANTE', '/manutencao-externa/chamados')
    add('ME_SEM_1A_RESPOSTA', 'Chamados elegíveis ao SLA sem horário de primeira resposta', await cnt(`select count(*)::int n from chamado_externo where competencia=$1 and excluido_em is null and status<>'CANCELADO' and elegivel_sla and primeira_resposta_em is null`), 'ALERTA', '/manutencao-externa/chamados')
    add('ME_ABERTOS', 'Chamados ainda abertos ou em atendimento', await cnt(`select count(*)::int n from chamado_externo where competencia=$1 and excluido_em is null and status in ('ABERTO','EM_ATENDIMENTO')`), 'ALERTA', '/manutencao-externa/chamados')
    add('ME_TROCAS_PENDENTES', 'Trocas solicitadas ainda pendentes', await cnt(`select count(*)::int n from solicitacao_troca where competencia=$1 and excluido_em is null and status='PENDENTE'`), 'ALERTA', '/manutencao-externa/trocas')
  }
  if (area === 'ESTOQUE_PECAS') {
    add('EP_SALDO_NEGATIVO', 'Itens/famílias com saldo calculado negativo no fim do mês', await cnt(
      `select count(*)::int n from (select familia_id, item_peca_id, sum(case tipo when 'ENTRADA' then quantidade when 'SAIDA' then -quantidade when 'AJUSTE' then quantidade else 0 end) s
         from movimento_estoque where excluido_em is null and data <= $1 group by 1,2) x where s < 0`, [fim]), 'ALERTA', '/estoque-pecas/saldos')
  }
  if (area === 'COMODATO') {
    add('CO_SEM_BASE', 'Base instalada ativa do mês não registrada', (await cnt(`select count(*)::int n from comodato_base_ativa where competencia=$1 and excluido_em is null`)) ? 0 : 1, 'ALERTA', '/comodato/base')
    add('CO_POSICAO_ANTERIOR', 'Posição anterior diferente da posição final do mês anterior', await cnt(
      `select count(*)::int n from comodato_posicao a join comodato_posicao b on upper(b.produto) = upper(a.produto) and b.competencia = (a.competencia - interval '1 month')::date and b.excluido_em is null
        where a.competencia = $1 and a.excluido_em is null and a.posicao_anterior <> b.novos + b.usados`), 'BLOQUEANTE', '/comodato/posicao')
    add('CO_AJUSTES', 'Posições com ajuste de conciliação (revisar justificativa)', await cnt(`select count(*)::int n from comodato_posicao where competencia=$1 and excluido_em is null and ajuste <> 0`), 'ALERTA', '/comodato/posicao')
    add('CO_EM_ABERTO', 'Movimentos solicitados/agendados sem conclusão', await cnt(`select count(*)::int n from comodato_movimento where competencia=$1 and excluido_em is null and situacao in ('SOLICITADO','AGENDADO')`), 'ALERTA', '/comodato/movimentos')
  }
  if (area === 'TI') {
    add('TI_INDISP_ABERTA', 'Indisponibilidades sem horário de fim', await cnt(`select count(*)::int n from ti_indisponibilidade where competencia=$1 and excluido_em is null and fim is null`), 'BLOQUEANTE', '/ti/disponibilidade')
    add('TI_SEM_JANELA', 'Sistemas críticos sem tempo programado cadastrado', await cnt(`select count(*)::int n from ti_sistema s where s.critico and s.ativo and not exists (select 1 from ti_janela_programada j where j.sistema_id = s.id and j.competencia = $1)`), 'ALERTA', '/ti/disponibilidade')
    add('TI_SEM_CATEGORIA', 'Chamados sem categoria', await cnt(`select count(*)::int n from chamado_ti where competencia=$1 and excluido_em is null and not dado_teste and coalesce(categoria,'')=''`), 'ALERTA', '/ti/chamados')
    add('TI_P1_ABERTO', 'Incidentes críticos sem causa raiz tratada', await cnt(`select count(*)::int n from ti_incidente_critico where excluido_em is null and status <> 'CAUSA_TRATADA' and aberto_em <= ($1::date + 1)`, [fim]), 'ALERTA', '/ti/incidentes')
    add('TI_TESTES', 'Chamados marcados como teste (excluídos dos indicadores)', await cnt(`select count(*)::int n from chamado_ti where competencia=$1 and excluido_em is null and dado_teste`), 'ALERTA', '/ti/chamados')
  }
  return itens
}

/** Indicadores vermelhos da área sem plano de ação e sem explicação de desvio (bloqueiam o envio). */
export async function exigenciasIndicadores(area: AreaCodigo, comp: string, resultados?: Resultado[], db: Db = pool()) {
  const res = resultados ?? (await calcularPainel(comp, 'MES', { area, classes: ['ESSENCIAL', 'COMPLEMENTAR'] }, { db }))
  const vermelhos = res.filter((r) => r.status === 'VERMELHO')
  const amarelos = res.filter((r) => r.status === 'AMARELO')
  const planos = await q<{ indicador_codigo: string }>(
    `select distinct indicador_codigo from plano_acao where area_codigo = $1 and status <> 'CANCELADA' and indicador_codigo is not null
       and (competencia_origem = $2 or (status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA') and inicio <= $3))`, [area, comp, ultimoDia(comp)], db)
  const explic = await q<{ indicador_codigo: string }>(
    `select distinct indicador_codigo from analise_item where area_codigo = $1 and competencia = $2 and excluido_em is null and tipo = 'EXPLICACAO_DESVIO' and indicador_codigo is not null`, [area, comp], db)
  const comPlano = new Set(planos.map((p) => p.indicador_codigo))
  const comExpl = new Set(explic.map((p) => p.indicador_codigo))
  return {
    vermelhosSemPlano: vermelhos.filter((r) => !comPlano.has(r.codigo)),
    vermelhosSemExplicacao: vermelhos.filter((r) => !comExpl.has(r.codigo)),
    amarelosSemExplicacao: amarelos.filter((r) => !comExpl.has(r.codigo)),
    resultados: res,
  }
}

/* ------------------------------------------------------------------ transição */

export class ErroFechamento extends Error {}

export async function transicionar(u: UsuarioSessao, area: AreaCodigo, comp: string, acao: AcaoFechamento, opts: { versaoEsperada: number; justificativa?: string }) {
  const t = TRANSICOES[acao]
  if (!pode(u, t.permissao, area)) throw new AcessoNegado()
  const just = opts.justificativa?.trim() ?? ''
  if (t.exigeJustificativa && just.length < 15) throw new ErroFechamento('Informe uma justificativa com pelo menos 15 caracteres.')

  // Pré-condições de conteúdo (fora da transação: leitura)
  let detalhes: Record<string, unknown> = {}
  if (acao === 'ENVIAR_VALIDACAO') {
    const itens = await checklist(area, comp)
    const bloq = itens.filter((i) => i.severidade === 'BLOQUEANTE')
    if (bloq.length) throw new ErroFechamento(`Pendências bloqueantes: ${bloq.map((b) => `${b.descricao} (${b.quantidade})`).join('; ')}.`)
    const ex = await exigenciasIndicadores(area, comp)
    if (ex.vermelhosSemPlano.length) throw new ErroFechamento(`Indicadores fora da meta sem plano de ação: ${ex.vermelhosSemPlano.map((r) => r.nome).join(', ')}.`)
    if (ex.vermelhosSemExplicacao.length) throw new ErroFechamento(`Explique o desvio (Análises) de: ${ex.vermelhosSemExplicacao.map((r) => r.nome).join(', ')}.`)
    detalhes = { alertas: itens.map((i) => ({ chave: i.chave, quantidade: i.quantidade })), amarelos_sem_explicacao: ex.amarelosSemExplicacao.map((r) => r.codigo) }
  }
  if (acao === 'REABRIR') {
    const antes = await q(`select indicador_codigo, valor, status, meta_descricao, hash from indicador_resultado r
                            join indicador_definicao d on d.id = r.definicao_id
                           where r.escopo = 'MES' and r.periodo_inicio = $1 and d.area_codigo = $2`, [comp, area])
    detalhes = { resultados_antes_da_reabertura: antes }
  }

  await tx({ usuarioId: u.id, contexto: { acao_fechamento: acao } }, async (db) => {
    await db.query(`insert into periodo_area (competencia, area_codigo, status, versao) values ($1, $2, 'RASCUNHO', 0) on conflict (competencia, area_codigo) do nothing`, [comp, area])
    const atual = (await db.query<{ id: number; status: StatusPeriodo; versao: number }>(`select id, status, versao from periodo_area where competencia = $1 and area_codigo = $2 for update`, [comp, area])).rows[0]
    if (atual.versao !== opts.versaoEsperada) throw new ErroFechamento('O período foi alterado por outra pessoa. Recarregue a página e confira antes de continuar.')
    if (!t.de.includes(atual.status)) throw new ErroFechamento(`Ação não permitida a partir do status "${ROTULO_STATUS[atual.status]}".`)
    await db.query(`update periodo_area set status = $2, versao = versao + 1, atualizado_em = now(), atualizado_por = $3 where id = $1`, [atual.id, t.para, u.id])
    await db.query(`insert into periodo_evento (periodo_area_id, de_status, para_status, acao, justificativa, usuario_id, detalhes) values ($1,$2,$3,$4,$5,$6,$7)`,
      [atual.id, atual.status, t.para, acao, just || null, u.id, JSON.stringify(detalhes)])
    if (acao === 'REABRIR') {
      await db.query(`insert into evento_sistema (tipo, usuario_id, detalhes) values ('REABERTURA_PERIODO', $1, $2)`, [u.id, JSON.stringify({ area, competencia: comp, justificativa: just })])
    }
  })

  // Ao aprovar/fechar, recalcula e grava a fotografia oficial dos indicadores da área
  if (acao === 'APROVAR' || acao === 'FECHAR' || acao === 'REABRIR') {
    await calcularPainel(comp, 'MES', { area }, { forcar: true, usuarioId: u.id })
  }
}

export async function historicoPeriodo(area: string, comp: string) {
  return q<{ acao: string; de_status: string | null; para_status: string; justificativa: string | null; em: string; nome: string | null }>(
    `select e.acao, e.de_status, e.para_status, e.justificativa, e.em::text, u.nome
       from periodo_evento e join periodo_area p on p.id = e.periodo_area_id left join usuario u on u.id = e.usuario_id
      where p.area_codigo = $1 and p.competencia = $2 order by e.em desc`, [area, comp])
}
