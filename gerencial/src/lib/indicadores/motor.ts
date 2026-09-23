/**
 * Motor de indicadores: calcula no servidor, a partir dos dados de origem, com meta vigente,
 * status, comparação e memória de cálculo reproduzível. Resultados ficam em indicador_resultado
 * (cache seguro): são reutilizados enquanto nenhuma tabela de origem mudou (verificado pela
 * trilha de auditoria) e congelados quando o período está FECHADO.
 */
import { createHash } from 'node:crypto'
import { q, q1, pool, type Db } from '@/lib/db'
import { mesesDoEscopo, somarMeses, ultimoDia, type Escopo } from '@/lib/competencia'
import { CALENDARIO_PADRAO, type Calendario } from '@/lib/horas-uteis'
import { CALCULADORES, type ResultadoMes, type FonteResultado, type SituacaoDado } from './calculadores'
import { classificar, classificarTendencia, descreverMeta, type AlvoMeta, type Status } from './status'

export interface Definicao {
  id: number
  codigo: string
  versao: number
  nome: string
  area_codigo: string
  descricao: string
  unidade_medida: string
  formula: string
  origem_dados: string
  numerador: string | null
  denominador: string | null
  direcao: 'MAIOR_MELHOR' | 'MENOR_MELHOR' | 'FAIXA' | 'INFORMATIVO'
  consolidacao: 'FOTOGRAFIA' | 'SOMA' | 'MEDIA_SIMPLES' | 'MEDIA_PONDERADA' | 'ULTIMO_VALOR' | 'TAXA_CONTAGEM'
  responsavel: string | null
  fonte_regra: string
  classe: 'ESSENCIAL' | 'COMPLEMENTAR' | 'CANDIDATO' | 'OPERACIONAL'
  ativo: boolean
  casas_decimais: number
  calculador: string
  homologado: boolean
  pendencias: string | null
  ordem: number
}

export interface MetaRow {
  id: number
  indicador_codigo: string
  versao: number
  ciclo: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
  tipo: string
  operador: AlvoMeta['operador']
  valor: number | null
  valor_max: number | null
  linha_base: number | null
  linha_base_competencia: string | null
  tolerancia_pct: number
  vigencia_inicio: string
  vigencia_fim: string | null
  status: string
  fonte_documento: string
  motivo: string
}

export interface Resultado {
  codigo: string
  nome: string
  area: string
  unidade: string
  casas: number
  classe: Definicao['classe']
  direcao: Definicao['direcao']
  consolidacao: Definicao['consolidacao']
  escopo: Escopo
  periodoInicio: string
  periodoFim: string
  valor: number | null
  numerador: number | null
  denominador: number | null
  situacao: SituacaoDado
  motivo: string | null
  metaId: number | null
  metaDescricao: string | null
  alvo: number | null
  status: Status
  valorAnterior: number | null
  variacaoAbs: number | null
  variacaoPct: number | null
  fonte: FonteResultado
  memoria: Memoria
  calculadoEm: string
}

export interface Memoria {
  definicao: { id: number; versao: number; formula: string; consolidacao: string; calculador: string }
  meses: { competencia: string; valor: number | null; numerador?: number | null; denominador?: number | null; situacao: SituacaoDado; motivo?: string; fonte: FonteResultado; detalhes?: Record<string, unknown> }[]
  meta: null | { id: number; versao: number; ciclo: string; tipo: string; operador: string; valor: number | null; valor_max: number | null; alvo: number | null; tolerancia_pct: number; fonte: string; observacao?: string }
  regra: string
  auditoria_max_id: number
  congelado?: boolean
}

const CICLO: Record<Escopo, MetaRow['ciclo']> = { MES: 'MENSAL', TRIMESTRE: 'TRIMESTRAL', SEMESTRE: 'SEMESTRAL', ANO: 'ANUAL' }

/* ------------------------------------------------------------------ carga de contexto */

export async function carregarCalendario(db: Db = pool()): Promise<Calendario> {
  const cfg = await q1<{ valor: { fuso?: string; dias_uteis?: number[]; inicio?: string; fim?: string } }>(`select valor from configuracao where chave = 'calendario.expediente'`, [], db)
  const fer = await q<{ d: string }>(`select data::text as d from calendario_feriado where unidade_id is null and not meio_periodo`, [], db)
  const v = cfg?.valor ?? {}
  return {
    fuso: v.fuso ?? CALENDARIO_PADRAO.fuso,
    diasUteis: v.dias_uteis ?? CALENDARIO_PADRAO.diasUteis,
    inicio: v.inicio ?? CALENDARIO_PADRAO.inicio,
    fim: v.fim ?? CALENDARIO_PADRAO.fim,
    feriados: new Set(fer.map((f) => f.d)),
  }
}

export async function carregarConfig(db: Db = pool()): Promise<Record<string, unknown>> {
  const rows = await q<{ chave: string; valor: unknown }>(`select chave, valor from configuracao`, [], db)
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor]))
}

export async function definicoesVigentes(db: Db = pool(), filtro?: { area?: string; classes?: Definicao['classe'][]; incluirInativos?: boolean }): Promise<Definicao[]> {
  const rows = await q<Definicao>(
    `select distinct on (codigo) id, codigo, versao, nome, area_codigo, descricao, unidade_medida, formula, origem_dados, numerador, denominador,
            direcao, consolidacao, responsavel, fonte_regra, classe, ativo, casas_decimais, calculador, homologado, pendencias, ordem
       from indicador_definicao
      where vigencia_inicio <= current_date and (vigencia_fim is null or vigencia_fim >= current_date)
      order by codigo, versao desc`, [], db)
  return rows
    .filter((d) => (filtro?.incluirInativos ? true : d.ativo))
    .filter((d) => !filtro?.area || d.area_codigo === filtro.area)
    .filter((d) => !filtro?.classes || filtro.classes.includes(d.classe))
    .sort((a, b) => a.ordem - b.ordem)
}

export async function definicao(codigo: string, db: Db = pool()): Promise<Definicao | undefined> {
  return q1<Definicao>(
    `select id, codigo, versao, nome, area_codigo, descricao, unidade_medida, formula, origem_dados, numerador, denominador,
            direcao, consolidacao, responsavel, fonte_regra, classe, ativo, casas_decimais, calculador, homologado, pendencias, ordem
       from indicador_definicao where codigo = $1
        and vigencia_inicio <= current_date and (vigencia_fim is null or vigencia_fim >= current_date)
      order by versao desc limit 1`, [codigo], db)
}

/* ------------------------------------------------------------------ meses e consolidação */

async function auditoriaMax(db: Db): Promise<number> {
  const r = await q1<{ m: number | null }>(`select max(id)::float8 as m from auditoria`, [], db)
  return r?.m ?? 0
}

async function houveMudanca(tabelas: string[], desde: number, db: Db): Promise<boolean> {
  const t = [...new Set([...tabelas, 'meta', 'indicador_definicao', 'configuracao', 'periodo_area', 'importacao'])]
  const r = await q1<{ e: boolean }>(`select exists(select 1 from auditoria where id > $1 and tabela = any($2)) as e`, [desde, t], db)
  return !!r?.e
}

async function periodoFechado(area: string, comp: string, db: Db): Promise<boolean> {
  const r = await q1<{ status: string }>(`select status from periodo_area where area_codigo = $1 and competencia = $2`, [area, comp], db)
  return r?.status === 'FECHADO'
}

type Mes = Memoria['meses'][number]

/** Resultado mensal (com cache controlado pela auditoria e congelamento de período fechado). */
async function resultadoMes(def: Definicao, comp: string, ctx: { db: Db; cal: Calendario; config: Record<string, unknown>; audMax: number; forcar?: boolean }): Promise<Mes> {
  const calc = CALCULADORES[def.calculador] ?? CALCULADORES.PENDENTE
  const cache = await q1<{ valor: number | null; numerador: number | null; denominador: number | null; situacao_dado: SituacaoDado; motivo: string | null; fonte: FonteResultado; memoria: Memoria; definicao_id: number }>(
    `select valor, numerador, denominador, situacao_dado, motivo, fonte, memoria, definicao_id from indicador_resultado
      where indicador_codigo = $1 and escopo = 'MES' and periodo_inicio = $2 and unidade_id is null`, [def.codigo, comp], ctx.db)
  if (cache && cache.definicao_id === def.id && !ctx.forcar) {
    const congelado = await periodoFechado(def.area_codigo, comp, ctx.db)
    if (congelado || !(await houveMudanca(calc.tabelas, cache.memoria.auditoria_max_id, ctx.db))) {
      const m = cache.memoria.meses[0]
      return m ?? { competencia: comp, valor: cache.valor, numerador: cache.numerador, denominador: cache.denominador, situacao: cache.situacao_dado, motivo: cache.motivo ?? undefined, fonte: cache.fonte }
    }
  }
  const r: ResultadoMes = await calc.mes({ db: ctx.db, comp, cal: ctx.cal, config: ctx.config })
  return { competencia: comp, valor: r.valor, numerador: r.numerador ?? null, denominador: r.denominador ?? null, situacao: r.situacao, motivo: r.motivo, fonte: r.fonte, detalhes: r.detalhes }
}

/** Consolida meses conforme o método do indicador. Nunca mistura fotografia, soma e média. */
export function consolidar(metodo: Definicao['consolidacao'], meses: Mes[], fatorTaxa: number): Pick<Mes, 'valor' | 'numerador' | 'denominador' | 'situacao' | 'motivo'> & { regra: string } {
  const faltantes = meses.filter((m) => m.situacao === 'NAO_INFORMADO').map((m) => m.competencia.slice(0, 7))
  if (meses.length === 1 && meses[0].situacao !== 'OK') {
    const m = meses[0]
    return { valor: null, numerador: m.numerador ?? null, denominador: m.denominador ?? null, situacao: m.situacao, motivo: m.motivo, regra: 'Competência isolada.' }
  }
  switch (metodo) {
    case 'FOTOGRAFIA':
    case 'ULTIMO_VALOR': {
      const ult = meses[meses.length - 1]
      return { valor: ult.valor, numerador: ult.numerador ?? null, denominador: ult.denominador ?? null, situacao: ult.situacao, motivo: ult.motivo, regra: 'Fotografia: valor da última competência do período.' }
    }
    case 'SOMA': {
      if (faltantes.length) return { valor: null, numerador: null, denominador: null, situacao: 'NAO_INFORMADO', motivo: `Competências sem dados: ${faltantes.join(', ')}.`, regra: 'Soma das competências.' }
      const v = meses.reduce((s, m) => s + (m.valor ?? 0), 0)
      return { valor: v, numerador: v, denominador: null, situacao: 'OK', regra: 'Soma das competências.' }
    }
    case 'MEDIA_SIMPLES': {
      if (faltantes.length) return { valor: null, numerador: null, denominador: null, situacao: 'NAO_INFORMADO', motivo: `Competências sem dados: ${faltantes.join(', ')}.`, regra: 'Média simples dos valores mensais.' }
      const vals = meses.filter((m) => m.valor !== null)
      if (!vals.length) return { valor: null, numerador: null, denominador: null, situacao: 'NAO_APLICAVEL', motivo: 'Sem valores no período.', regra: 'Média simples.' }
      return { valor: vals.reduce((s, m) => s + (m.valor as number), 0) / vals.length, numerador: null, denominador: vals.length, situacao: 'OK', regra: 'Média simples dos valores mensais.' }
    }
    case 'MEDIA_PONDERADA':
    case 'TAXA_CONTAGEM': {
      if (faltantes.length) return { valor: null, numerador: null, denominador: null, situacao: 'NAO_INFORMADO', motivo: `Competências sem dados: ${faltantes.join(', ')}.`, regra: 'Recalculada: Σ numeradores ÷ Σ denominadores.' }
      const num = meses.reduce((s, m) => s + (m.numerador ?? 0), 0)
      const den = meses.reduce((s, m) => s + (m.denominador ?? 0), 0)
      if (den === 0) return { valor: null, numerador: num, denominador: 0, situacao: 'NAO_APLICAVEL', motivo: 'Denominador zero no período.', regra: 'Recalculada: Σ numeradores ÷ Σ denominadores.' }
      return { valor: (num / den) * fatorTaxa, numerador: num, denominador: den, situacao: 'OK', regra: 'Recalculada a partir do total elegível: Σ numeradores ÷ Σ denominadores (não é média de percentuais).' }
    }
  }
}

/** Fator da taxa (100 para %; 1 para médias como horas/kg). */
function fatorTaxa(def: Definicao): number {
  return def.unidade_medida === '%' || def.unidade_medida === 'por 100 equip' ? 100 : 1
}

/* ------------------------------------------------------------------ metas */

export async function metaVigente(codigo: string, escopo: Escopo, inicio: string, fim: string, db: Db = pool()): Promise<{ meta: MetaRow; aplicadaDe?: string } | null> {
  const buscar = (ciclo: string) => q1<MetaRow>(
    `select id, indicador_codigo, versao, ciclo, tipo, operador, valor, valor_max, linha_base, linha_base_competencia::text as linha_base_competencia,
            tolerancia_pct, vigencia_inicio::text as vigencia_inicio, vigencia_fim::text as vigencia_fim, status, fonte_documento, motivo
       from meta where indicador_codigo = $1 and ciclo = $2 and status = 'APROVADA'
        and vigencia_inicio <= $4 and (vigencia_fim is null or vigencia_fim >= $3)
      order by versao desc limit 1`, [codigo, ciclo, inicio, fim], db)
  const m = await buscar(CICLO[escopo])
  if (m) return { meta: m }
  return null
}

/** Para taxas (média ponderada/fotografia de %), a meta mensal vale para qualquer período. */
async function metaAplicavel(def: Definicao, escopo: Escopo, inicio: string, fim: string, db: Db) {
  const m = await metaVigente(def.codigo, escopo, inicio, fim, db)
  if (m) return m
  const escalaInvariante = ['MEDIA_PONDERADA', 'MEDIA_SIMPLES', 'TAXA_CONTAGEM'].includes(def.consolidacao)
    || (def.consolidacao === 'FOTOGRAFIA' && def.unidade_medida === '%')
    || (def.consolidacao === 'FOTOGRAFIA' && def.direcao === 'MENOR_MELHOR')
  if (escopo !== 'MES' && escalaInvariante) {
    const mensal = await metaVigente(def.codigo, 'MES', inicio, fim, db)
    if (mensal && mensal.meta.tipo === 'ABSOLUTA') return { meta: mensal.meta, aplicadaDe: 'Meta mensal aplicada ao período (indicador de taxa/fotografia).' }
  }
  return null
}

function mesesEntre(a: string, b: string) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Resolve o alvo numérico de uma meta para o período. */
export function resolverAlvo(meta: MetaRow, ctx: { fimCompetencia: string; valorAnterior: number | null; valorFimCicloAnterior: number | null }): { alvo: number | null; observacao?: string } {
  if (meta.valor === null) return { alvo: null, observacao: 'Valor da meta pendente de homologação.' }
  switch (meta.tipo) {
    case 'ABSOLUTA':
    case 'CONTAGEM_MINIMA':
      return { alvo: meta.valor }
    case 'LINHA_BASE_MAIS':
      if (meta.ciclo === 'MENSAL') {
        if (meta.linha_base === null || !meta.linha_base_competencia) return { alvo: null, observacao: 'Linha de base pendente de homologação.' }
        return { alvo: meta.linha_base + meta.valor * mesesEntre(meta.linha_base_competencia, ctx.fimCompetencia), observacao: `Linha de base ${meta.linha_base} (${meta.linha_base_competencia.slice(0, 7)}) + ${meta.valor}/mês.` }
      }
      if (meta.linha_base !== null) return { alvo: meta.linha_base + meta.valor }
      if (ctx.valorFimCicloAnterior === null) return { alvo: null, observacao: 'Posição do fim do ciclo anterior não informada.' }
      return { alvo: ctx.valorFimCicloAnterior + meta.valor, observacao: `Fim do ciclo anterior (${ctx.valorFimCicloAnterior}) + ${meta.valor}.` }
    case 'PERCENTUAL_SOBRE_LINHA_BASE':
      if (meta.linha_base === null) return { alvo: null, observacao: 'Linha de base pendente de homologação.' }
      return { alvo: meta.linha_base * (1 + meta.valor / 100), observacao: `Linha de base ${meta.linha_base} ${meta.valor >= 0 ? '+' : ''}${meta.valor}%.` }
    case 'VARIACAO_PERIODO_ANTERIOR':
      if (ctx.valorAnterior === null) return { alvo: null, observacao: 'Período anterior sem valor.' }
      return { alvo: ctx.valorAnterior * (1 + meta.valor / 100), observacao: `Período anterior (${ctx.valorAnterior}) ${meta.valor >= 0 ? '+' : ''}${meta.valor}%.` }
    case 'TENDENCIA_QUEDA':
      return { alvo: null, observacao: 'Meta de tendência de queda (inclinação da série mensal).' }
    default:
      return { alvo: null, observacao: `Tipo de meta não suportado: ${meta.tipo}` }
  }
}

/* ------------------------------------------------------------------ API principal */

export interface OpcoesCalculo {
  db?: Db
  forcar?: boolean
  usuarioId?: string | null
  /** não persiste (usado para o período de comparação) */
  semPersistir?: boolean
  cal?: Calendario
  config?: Record<string, unknown>
}

function periodoAnterior(ref: string, escopo: Escopo): string {
  // referência equivalente do período anterior
  if (escopo === 'MES') return somarMeses(ref, -1)
  if (escopo === 'TRIMESTRE') return somarMeses(ref, -3)
  if (escopo === 'SEMESTRE') return somarMeses(ref, -6)
  return somarMeses(ref, -12)
}

function fimDoCicloAnterior(ref: string, escopo: Escopo): string | null {
  if (escopo === 'MES') return somarMeses(ref, -1)
  const inicio = mesesDoEscopo(ref, escopo)[0]
  return somarMeses(inicio, -1)
}

export async function calcularIndicador(codigo: string, ref: string, escopo: Escopo, op: OpcoesCalculo = {}): Promise<Resultado> {
  const db = op.db ?? pool()
  const def = await definicao(codigo, db)
  if (!def) throw new Error(`Indicador ${codigo} não encontrado`)
  const cal = op.cal ?? (await carregarCalendario(db))
  const config = op.config ?? (await carregarConfig(db))
  const audMax = await auditoriaMax(db)
  const meses = mesesDoEscopo(ref, escopo)
  const inicio = meses[0]
  const fim = ultimoDia(meses[meses.length - 1])

  const mesesRes: Mes[] = []
  for (const m of meses) {
    const r = await resultadoMes(def, m, { db, cal, config, audMax, forcar: op.forcar })
    mesesRes.push(r)
    // Persistimos cada mês para que o drill-down e o cache funcionem
    if (!op.semPersistir && escopo !== 'MES') {
      await persistirMes(def, r, audMax, op.usuarioId ?? null, db)
    }
  }
  const cons = consolidar(def.consolidacao, mesesRes, fatorTaxa(def))

  // Comparação com o período anterior (sem persistir, sem recursão profunda)
  let valorAnterior: number | null = null
  if (!op.semPersistir) {
    const ant = await calcularIndicador(codigo, periodoAnterior(ref, escopo), escopo, { ...op, db, cal, config, semPersistir: true })
    valorAnterior = ant.valor
  }
  let valorFimCicloAnterior: number | null = null
  const fca = fimDoCicloAnterior(ref, escopo)
  if (fca && def.consolidacao === 'FOTOGRAFIA') {
    const r = await resultadoMes(def, fca, { db, cal, config, audMax })
    valorFimCicloAnterior = r.valor
  }

  // Meta vigente e status
  const mv = def.direcao === 'INFORMATIVO' ? null : await metaAplicavel(def, escopo, inicio, fim, db)
  let alvo: number | null = null
  let status: Status
  let metaObs: string | undefined
  if (!mv) {
    status = cons.valor === null ? 'NA' : 'SEM_META'
  } else if (mv.meta.tipo === 'TENDENCIA_QUEDA') {
    status = cons.situacao !== 'OK' ? 'NA' : classificarTendencia(mesesRes.map((m) => m.valor), 'QUEDA')
    metaObs = 'Tendência de queda: inclinação negativa da série mensal no ciclo.'
  } else {
    const a = resolverAlvo(mv.meta, { fimCompetencia: meses[meses.length - 1], valorAnterior, valorFimCicloAnterior })
    alvo = a.alvo
    metaObs = [mv.aplicadaDe, a.observacao].filter(Boolean).join(' ')
    const alvoMeta: AlvoMeta | null = alvo === null ? null : { operador: mv.meta.operador, alvo, alvoMax: mv.meta.valor_max, toleranciaPct: mv.meta.tolerancia_pct }
    status = cons.situacao !== 'OK' ? 'NA' : classificar(cons.valor, alvoMeta)
  }
  const metaDescricao = !mv ? null
    : mv.meta.tipo === 'TENDENCIA_QUEDA' ? 'Tendência de queda'
    : alvo === null ? 'Pendente de homologação'
    : descreverMeta({ operador: mv.meta.operador, alvo, alvoMax: mv.meta.valor_max, toleranciaPct: mv.meta.tolerancia_pct }, def.unidade_medida, def.casas_decimais)

  const fontes = new Set(mesesRes.filter((m) => m.situacao === 'OK').map((m) => m.fonte))
  const fonte: FonteResultado = fontes.size === 0 ? 'NENHUMA' : fontes.size > 1 ? 'MISTO' : [...fontes][0]
  const variacaoAbs = cons.valor !== null && valorAnterior !== null ? cons.valor - valorAnterior : null
  const variacaoPct = variacaoAbs !== null && valorAnterior ? (variacaoAbs / Math.abs(valorAnterior)) * 100 : null

  const memoria: Memoria = {
    definicao: { id: def.id, versao: def.versao, formula: def.formula, consolidacao: def.consolidacao, calculador: def.calculador },
    meses: mesesRes,
    meta: mv ? { id: mv.meta.id, versao: mv.meta.versao, ciclo: mv.meta.ciclo, tipo: mv.meta.tipo, operador: mv.meta.operador, valor: mv.meta.valor, valor_max: mv.meta.valor_max, alvo, tolerancia_pct: mv.meta.tolerancia_pct, fonte: mv.meta.fonte_documento, observacao: metaObs } : null,
    regra: cons.regra,
    auditoria_max_id: audMax,
  }
  const res: Resultado = {
    codigo: def.codigo, nome: def.nome, area: def.area_codigo, unidade: def.unidade_medida, casas: def.casas_decimais,
    classe: def.classe, direcao: def.direcao, consolidacao: def.consolidacao, escopo,
    periodoInicio: inicio, periodoFim: fim,
    valor: cons.valor, numerador: cons.numerador ?? null, denominador: cons.denominador ?? null,
    situacao: cons.situacao, motivo: cons.motivo ?? null,
    metaId: mv?.meta.id ?? null, metaDescricao, alvo, status,
    valorAnterior, variacaoAbs, variacaoPct, fonte, memoria, calculadoEm: new Date().toISOString(),
  }
  if (!op.semPersistir) await persistir(def, res, op.usuarioId ?? null, db)
  return res
}

function hashMemoria(m: unknown) {
  return createHash('sha256').update(JSON.stringify(m)).digest('hex')
}

async function persistirMes(def: Definicao, m: Mes, audMax: number, usuarioId: string | null, db: Db) {
  // Linha mensal mínima (sem meta) apenas para cache/drill-down quando o mês ainda não foi calculado isoladamente
  const existe = await q1<{ id: number }>(`select id from indicador_resultado where indicador_codigo = $1 and escopo = 'MES' and periodo_inicio = $2 and unidade_id is null`, [def.codigo, m.competencia], db)
  if (existe) return
  const memoria = { definicao: { id: def.id, versao: def.versao, formula: def.formula, consolidacao: def.consolidacao, calculador: def.calculador }, meses: [m], meta: null, regra: 'Mês isolado', auditoria_max_id: audMax }
  await q(
    `insert into indicador_resultado (indicador_codigo, definicao_id, escopo, periodo_inicio, periodo_fim, valor, numerador, denominador,
        situacao_dado, motivo, status, fonte, memoria, hash, calculado_por)
     values ($1,$2,'MES',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing`,
    [def.codigo, def.id, m.competencia, ultimoDia(m.competencia), m.valor, m.numerador ?? null, m.denominador ?? null, m.situacao, m.motivo ?? null,
      m.valor === null ? 'NA' : 'SEM_META', m.situacao === 'OK' ? m.fonte : 'NENHUMA', JSON.stringify(memoria), hashMemoria(memoria), usuarioId], db)
}

async function persistir(def: Definicao, r: Resultado, usuarioId: string | null, db: Db) {
  await q(
    `insert into indicador_resultado (indicador_codigo, definicao_id, escopo, periodo_inicio, periodo_fim, valor, numerador, denominador,
        situacao_dado, motivo, meta_id, meta_descricao, status, valor_anterior, variacao_abs, variacao_pct, fonte, memoria, hash, calculado_em, calculado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now(), $20)
     on conflict (indicador_codigo, escopo, periodo_inicio, coalesce(unidade_id, 0)) do update set
        definicao_id = excluded.definicao_id, periodo_fim = excluded.periodo_fim, valor = excluded.valor, numerador = excluded.numerador,
        denominador = excluded.denominador, situacao_dado = excluded.situacao_dado, motivo = excluded.motivo, meta_id = excluded.meta_id,
        meta_descricao = excluded.meta_descricao, status = excluded.status, valor_anterior = excluded.valor_anterior,
        variacao_abs = excluded.variacao_abs, variacao_pct = excluded.variacao_pct, fonte = excluded.fonte, memoria = excluded.memoria,
        hash = excluded.hash, calculado_em = now(), calculado_por = excluded.calculado_por`,
    [def.codigo, def.id, r.escopo, r.periodoInicio, r.periodoFim, r.valor, r.numerador, r.denominador, r.situacao, r.motivo,
      r.metaId, r.metaDescricao, r.status, r.valorAnterior, r.variacaoAbs, r.variacaoPct, r.fonte, JSON.stringify(r.memoria), hashMemoria(r.memoria), usuarioId], db)
}

/** Calcula um conjunto de indicadores para a competência e escopo (painéis e relatórios). */
export async function calcularPainel(ref: string, escopo: Escopo, filtro: { area?: string; classes?: Definicao['classe'][]; codigos?: string[] } = {}, op: OpcoesCalculo = {}): Promise<Resultado[]> {
  const db = op.db ?? pool()
  const cal = op.cal ?? (await carregarCalendario(db))
  const config = op.config ?? (await carregarConfig(db))
  let defs = await definicoesVigentes(db, { area: filtro.area, classes: filtro.classes })
  if (filtro.codigos) defs = defs.filter((d) => filtro.codigos!.includes(d.codigo))
  const out: Resultado[] = []
  for (const d of defs) out.push(await calcularIndicador(d.codigo, ref, escopo, { ...op, db, cal, config }))
  return out
}

/** Série mensal de um indicador (para gráficos de evolução). */
export async function serieMensalIndicador(codigo: string, meses: string[], op: OpcoesCalculo = {}) {
  const out: { competencia: string; valor: number | null; status: Status; alvo: number | null }[] = []
  for (const m of meses) {
    const r = await calcularIndicador(codigo, m, 'MES', op)
    out.push({ competencia: m, valor: r.valor, status: r.status, alvo: r.alvo })
  }
  return out
}
