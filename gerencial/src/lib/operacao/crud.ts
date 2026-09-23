import 'server-only'
import type { PoolClient } from 'pg'
import { mensagemErroDb, pool, q, q1, tx, type Db } from '@/lib/db'
import { errosPorCampo, paraDataHoraLocal, type Entrada } from '@/lib/validacao/comum'
import { validarPecas, type LinhaPeca } from '@/lib/validacao/manutencao-interna'
import { CADASTROS, resolverPorNome, rotulosPorId, verificarAtivo, type RefCadastro } from './cadastros'
import { colunasTabela, type CampoDef, type Dados, type EntidadeDef } from './entidades'
import { excluirPecasDe, listarPecas, realinharDataPecas, sincronizarPecas } from './pecas'
import type { ResultadoColagem, ResultadoLinha } from './tipos'

/**
 * Gravação genérica dos lançamentos operacionais (formulário, grade e colagem usam o mesmo
 * caminho: vínculos -> cadastros por nome -> zod -> cadastros ativos -> chave de negócio).
 */
export type Registro = Dados & {
  id: number
  versao?: number
  excluido_em?: Date | null
  __rotulos?: Record<string, string>
  __vinculos?: Record<string, string>
  __restritos?: Dados | null
  __pecas?: string
}

export interface CtxGravacao {
  usuarioId: string
  /** Pode ler/gravar campos restritos (e-mail, ramal, IP). */
  podeRestritos?: boolean
}

export type Modo = 'formulario' | 'grade' | 'colagem'

export class ErroNegocio extends Error {
  constructor(msg: string, public erros?: Record<string, string>) {
    super(msg)
  }
}

export const MSG_CONFLITO = 'Registro alterado por outra pessoa; recarregue a página para ver a versão atual.'

/* ------------------------------------------------------------------ */
/* Preparação e validação                                              */
/* ------------------------------------------------------------------ */

interface Preparado {
  dados: Dados
  restritos: Dados | null
  pecas: LinhaPeca[] | null
}

async function preparar(db: Db, def: EntidadeDef, entradaBruta: Entrada, anterior: Registro | null, ctx: CtxGravacao, modo: Modo): Promise<Preparado> {
  const erros: Record<string, string> = {}
  const e: Entrada = { ...entradaBruta }

  // Vínculos por número (reincidência, chamado vinculado)
  for (const vc of def.vinculos ?? []) {
    const numero = e[vc.campoNumero]?.trim()
    if (!numero) {
      e[vc.coluna] = ''
      continue
    }
    const pref = vc.tabela === 'chamado_ti' ? `order by (sistema_origem = 'TI') desc, id desc` : 'order by id desc'
    const alvo = await q1<{ id: number }>(
      `select id from ${vc.tabela} where numero = $1 and excluido_em is null and id <> $2 ${pref} limit 1`,
      [numero, def.tabela === vc.tabela ? (anterior?.id ?? 0) : 0], db,
    )
    if (!alvo) erros[vc.campoNumero] = `${vc.rotulo} nº ${numero} não encontrado.`
    else e[vc.coluna] = String(alvo.id)
  }

  // Colagem: cadastros informados por nome/código
  if (modo === 'colagem') {
    for (const c of def.campos) {
      const val = e[c.nome]?.trim()
      if (c.ref && val) {
        const r = await resolverPorNome(db, c.ref, val)
        if (r.erro) erros[c.nome] = r.erro
        else e[c.nome] = String(r.id)
      }
    }
  }

  const r = def.schema.safeParse(e)
  if (!r.success) for (const [k, m] of Object.entries(errosPorCampo(r.error.issues))) erros[k] ??= m
  if (!r.success || Object.keys(erros).length) throw new ErroNegocio('Revise os campos destacados.', erros)
  const dados = r.data
  await def.completar?.(db, dados)

  // Cadastros referenciados devem estar ativos na data do evento (salvo se já usados no registro)
  const dataEv = def.dataEvento(dados)
  for (const c of def.campos) {
    const val = dados[c.nome]
    if (!c.ref || val == null) continue
    if (anterior && anterior[c.nome] === val) continue
    const m = await verificarAtivo(db, c.ref, Number(val), dataEv)
    if (m) erros[c.nome] = m
  }

  // Chave de negócio (mensagem amigável antes do índice único)
  if (def.chaveNegocio) {
    const conds: string[] = []
    const params: unknown[] = []
    let completa = true
    for (const spec of def.chaveNegocio.colunas) {
      const [fn, col] = spec.includes(':') ? spec.split(':') : ['', spec]
      const val = dados[col]
      params.push(val ?? null)
      const p = `$${params.length}`
      if (fn === 'upper') conds.push(`upper(${col}) = upper(${p}::text)`)
      else if (fn === 'coalesce') conds.push(`coalesce(${col}, 0) = coalesce(${p}::int, 0)`)
      else if (val == null) completa = false
      else conds.push(`${col} = ${p}`)
    }
    if (completa) {
      params.push(anterior?.id ?? 0)
      const excl = def.controle.exclusao === 'fisica' ? '' : ' and excluido_em is null'
      const dup = await q1(`select 1 from ${def.tabela} where ${conds.join(' and ')} and id <> $${params.length}${excl} limit 1`, params, db)
      if (dup) erros[def.chaveNegocio.campo] = def.chaveNegocio.mensagem(dados)
    }
  }

  // Campos restritos: só considerados com permissão e quando enviados
  let restritos: Dados | null = null
  if (def.restrito && ctx.podeRestritos && def.restrito.campos.some((c) => e[c.nome] !== undefined)) {
    const rr = def.restrito.schema.safeParse(Object.fromEntries(def.restrito.campos.map((c) => [c.nome, e[c.nome]])))
    if (rr.success) restritos = rr.data
    else Object.assign(erros, errosPorCampo(rr.error.issues))
  }

  // Peças utilizadas
  let pecas: LinhaPeca[] | null = null
  if (def.pecas && e.pecas !== undefined) {
    const vp = validarPecas(e.pecas)
    if (vp.erros.length) erros.pecas = vp.erros.join(' ')
    else {
      pecas = vp.linhas
      for (const l of pecas.filter((x) => !x.id)) {
        for (const [refc, id] of [['familia_peca', l.familia_id], ['item_peca', l.item_peca_id], ['local_estoque', l.local_estoque_id]] as const) {
          if (id == null) continue
          const m = await verificarAtivo(db, refc, id, dataEv)
          if (m) erros.pecas = m
        }
      }
    }
  }

  if (Object.keys(erros).length) throw new ErroNegocio('Revise os campos destacados.', erros)
  return { dados, restritos, pecas }
}

/** Valida sem gravar (usado pelos testes e pela pré-visualização). */
export async function validarEntrada(def: EntidadeDef, entrada: Entrada, modo: Modo = 'formulario') {
  try {
    const p = await preparar(pool(), def, entrada, null, { usuarioId: '' }, modo)
    return { ok: true as const, dados: p.dados }
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false as const, erros: e.erros ?? { _: e.message } }
    throw e
  }
}

/* ------------------------------------------------------------------ */
/* Gravação                                                            */
/* ------------------------------------------------------------------ */

const valorColuna = (v: unknown) => (v === undefined ? null : v)

async function gravarDependentes(db: Db, def: EntidadeDef, id: number, p: Preparado, ctx: CtxGravacao, alterouDatas: boolean) {
  if (def.restrito && p.restritos) {
    const cols = def.restrito.campos.map((c) => c.nome)
    const vals = cols.map((c) => valorColuna(p.restritos![c]))
    await db.query(
      `insert into ${def.restrito.tabela} (${def.restrito.chave}, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       on conflict (${def.restrito.chave}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
      [id, ...vals],
    )
  }
  if (def.pecas && def.dataPecas) {
    const dataMov = def.dataPecas(p.dados)
    const referencia = def.pecas === 'EXTERNA' ? `Chamado ${p.dados.numero}` : `Oficina #${id}`
    if (p.pecas) await sincronizarPecas(db, def.pecas, id, p.pecas, dataMov, { usuarioId: ctx.usuarioId, referencia })
    else if (alterouDatas) await realinharDataPecas(db, def.pecas, id, dataMov, ctx.usuarioId)
  }
}

async function inserirNoDb(db: Db, def: EntidadeDef, entrada: Entrada, ctx: CtxGravacao, modo: Modo): Promise<{ id: number; versao: number | null }> {
  const p = await preparar(db, def, entrada, null, ctx, modo)
  const cols = colunasTabela(def)
  const vals: unknown[] = cols.map((c) => valorColuna(p.dados[c]))
  const add = (c: string, v: unknown) => {
    cols.push(c)
    vals.push(v)
  }
  add('criado_por', ctx.usuarioId)
  if (def.controle.atualizado) add('atualizado_por', ctx.usuarioId)
  if (def.controle.origem && !cols.includes('origem')) add('origem', 'MANUAL')
  for (const [c, v] of Object.entries(def.extrasInsercao?.(ctx.usuarioId) ?? {})) add(c, v)
  const r = await db.query<{ id: number; versao?: number }>(
    `insert into ${def.tabela} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     returning id${def.controle.versao ? ', versao' : ''}`,
    vals,
  )
  const id = r.rows[0].id
  await gravarDependentes(db, def, id, p, ctx, false)
  return { id, versao: r.rows[0].versao ?? null }
}

function falhaDb(e: unknown): ResultadoLinha {
  if (e instanceof ErroNegocio) return { ok: false, erro: e.message, erros: e.erros }
  const msg = mensagemErroDb(e)
  if (msg.startsWith('Erro inesperado')) console.error('[operacao] falha ao gravar', e)
  return { ok: false, erro: msg }
}

export async function criarRegistro(def: EntidadeDef, entrada: Entrada, ctx: CtxGravacao, modo: Modo = 'formulario'): Promise<ResultadoLinha> {
  try {
    const r = await tx({ usuarioId: ctx.usuarioId }, (db) => inserirNoDb(db, def, entrada, ctx, modo))
    return { ok: true, ...r }
  } catch (e) {
    return falhaDb(e)
  }
}

async function carregarParaAtualizar(db: Db, def: EntidadeDef, id: number): Promise<Registro> {
  const ant = await q1<Registro>(`select * from ${def.tabela} where id = $1 for update`, [id], db)
  if (!ant) throw new ErroNegocio('Registro não encontrado.')
  if (ant.excluido_em) throw new ErroNegocio('Registro excluído não pode ser alterado.')
  const motivo = def.somenteLeitura?.(ant)
  if (motivo) throw new ErroNegocio(motivo)
  return ant
}

/**
 * Atualiza com concorrência otimista. Campos ausentes em `entrada` mantêm o valor atual
 * (a grade envia só as suas colunas).
 */
export async function atualizarRegistro(
  def: EntidadeDef, id: number, versao: number | null, entrada: Entrada, ctx: CtxGravacao, modo: Modo = 'formulario',
): Promise<ResultadoLinha> {
  try {
    const r = await tx({ usuarioId: ctx.usuarioId }, async (db) => {
      const ant = await carregarParaAtualizar(db, def, id)
      if (def.controle.versao && (versao == null || ant.versao !== versao)) throw new ErroNegocio(MSG_CONFLITO)
      const base = registroParaEntrada(def, await completarRegistro(db, def, ant, { podeRestritos: false, pecas: false }))
      const p = await preparar(db, def, { ...base, ...entrada }, ant, ctx, modo)
      const cols = colunasTabela(def)
      const params: unknown[] = cols.map((c) => valorColuna(p.dados[c]))
      const sets = cols.map((c, i) => `${c} = $${i + 1}`)
      if (def.controle.versao) sets.push('versao = versao + 1')
      if (def.controle.atualizado) {
        params.push(ctx.usuarioId)
        sets.push(`atualizado_por = $${params.length}`, 'atualizado_em = now()')
      }
      params.push(id)
      let where = `id = $${params.length}`
      if (def.controle.versao) {
        params.push(versao)
        where += ` and versao = $${params.length}`
      }
      if (def.controle.exclusao !== 'fisica') where += ' and excluido_em is null'
      const u = await db.query<{ versao?: number }>(
        `update ${def.tabela} set ${sets.join(', ')} where ${where} returning ${def.controle.versao ? 'versao' : 'id'}`, params,
      )
      if (!u.rowCount) throw new ErroNegocio(MSG_CONFLITO)
      const datasMudaram = !!def.dataPecas && def.dataPecas(p.dados) !== def.dataPecas(ant)
      await gravarDependentes(db, def, id, p, ctx, datasMudaram)
      return { id, versao: u.rows[0].versao ?? null }
    })
    return { ok: true, ...r }
  } catch (e) {
    return falhaDb(e)
  }
}

/** Exclusão lógica com motivo (ou física, nas tabelas de planejamento sem colunas de exclusão). */
export async function excluirRegistro(def: EntidadeDef, id: number, versao: number | null, motivo: string, ctx: CtxGravacao): Promise<ResultadoLinha> {
  const m = motivo.trim()
  if (m.length < 5) return { ok: false, erro: 'Informe o motivo da exclusão (mínimo de 5 caracteres).', erros: { motivo: 'Informe o motivo da exclusão (mínimo de 5 caracteres).' } }
  try {
    await tx({ usuarioId: ctx.usuarioId, contexto: { motivo_exclusao: m.slice(0, 500) } }, async (db) => {
      const ant = await carregarParaAtualizar(db, def, id)
      if (def.controle.versao && versao != null && ant.versao !== versao) throw new ErroNegocio(MSG_CONFLITO)
      let n: number | null
      if (def.controle.exclusao === 'completa') {
        n = (await db.query(
          `update ${def.tabela} set excluido_em = now(), excluido_por = $2, motivo_exclusao = $3, versao = versao + 1
            where id = $1 and excluido_em is null`, [id, ctx.usuarioId, m])).rowCount
      } else if (def.controle.exclusao === 'simples') {
        n = (await db.query(`update ${def.tabela} set excluido_em = now(), versao = versao + 1 where id = $1 and excluido_em is null`, [id])).rowCount
      } else {
        n = (await db.query(`delete from ${def.tabela} where id = $1`, [id])).rowCount
      }
      if (!n) throw new ErroNegocio(MSG_CONFLITO)
      if (def.pecas) await excluirPecasDe(db, def.pecas, id, ctx.usuarioId)
    })
    return { ok: true, id }
  } catch (e) {
    return falhaDb(e)
  }
}

/**
 * "Colar linhas": grava as linhas válidas numa única transação (savepoint por linha) e
 * devolve os erros por número de linha, sem perder as válidas.
 */
export async function importarLinhas(def: EntidadeDef, linhas: { linha: number; entrada: Entrada }[], ctx: CtxGravacao): Promise<ResultadoColagem> {
  const out: ResultadoColagem = { gravadas: 0, ids: [], erros: [] }
  if (!linhas.length) return { ...out, erroGeral: 'Nenhuma linha para gravar.' }
  if (linhas.length > 2000) return { ...out, erroGeral: 'Limite de 2.000 linhas por colagem.' }
  const rotulo = (c: string) => [...def.campos, ...(def.restrito?.campos ?? [])].find((x) => x.nome === c)?.rotulo ?? (c === 'pecas' ? 'Peças' : c)
  try {
    await tx({ usuarioId: ctx.usuarioId, contexto: { origem: 'COLAGEM' } }, async (db: PoolClient) => {
      for (const l of linhas) {
        await db.query('savepoint linha')
        try {
          const r = await inserirNoDb(db, def, l.entrada, ctx, 'colagem')
          await db.query('release savepoint linha')
          out.gravadas++
          out.ids.push(r.id)
        } catch (e) {
          await db.query('rollback to savepoint linha')
          const msg = e instanceof ErroNegocio && e.erros
            ? Object.entries(e.erros).map(([k, m]) => (k === '_' ? m : `${rotulo(k)}: ${m}`)).join(' · ')
            : e instanceof ErroNegocio ? e.message : mensagemErroDb(e)
          out.erros.push({ linha: l.linha, mensagem: msg })
        }
      }
    })
  } catch (e) {
    return { gravadas: 0, ids: [], erros: out.erros, erroGeral: mensagemErroDb(e) }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export interface FiltrosLista {
  competencia?: string | null
  texto?: string
  selecoes?: Record<string, string | undefined>
  mostrarExcluidos?: boolean
  pagina?: number
  /** null = sem paginação (exportação) */
  porPagina?: number | null
}

export const VALOR_NULO = '__nulo'

function montarFiltro(def: EntidadeDef, f: FiltrosLista) {
  const conds: string[] = []
  const params: unknown[] = []
  const p = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  if (!def.semCompetencia && f.competencia) conds.push(`t.competencia = ${p(f.competencia)}::date`)
  if (def.controle.exclusao !== 'fisica' && !f.mostrarExcluidos) conds.push('t.excluido_em is null')
  if (f.texto && def.busca.length) conds.push(`concat_ws(' ', ${def.busca.map((b) => `${b}::text`).join(', ')}) ilike ${p(`%${f.texto.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)}`)
  for (const nome of def.filtros) {
    const val = f.selecoes?.[nome]
    const c = def.campos.find((x) => x.nome === nome)
    if (!val || !c) continue
    if (val === VALOR_NULO) conds.push(`t.${nome} is null`)
    else if (c.tipo === 'ref' && /^\d+$/.test(val)) conds.push(`t.${nome} = ${p(Number(val))}`)
    else if ((c.tipo === 'bool' || c.tipo === 'boolNulo') && (val === 'true' || val === 'false')) conds.push(`t.${nome} = ${p(val === 'true')}`)
    else if (c.tipo === 'enum' && c.opcoes?.includes(val)) conds.push(`t.${nome} = ${p(val)}`)
  }
  return { where: conds.length ? `where ${conds.join(' and ')}` : '', params, p }
}

const selectCalculadas = (def: EntidadeDef) => (def.calculadas ?? []).map((c) => `, ${c.sql} as ${c.nome}`).join('')

export async function listarRegistros(def: EntidadeDef, f: FiltrosLista, db: Db = pool()): Promise<{ linhas: Registro[]; total: number }> {
  const { where, params, p } = montarFiltro(def, f)
  const total = Number((await q1<{ n: number }>(`select count(*)::int as n from ${def.tabela} t ${where}`, params, db))?.n ?? 0)
  let limite = ''
  if (f.porPagina !== null) {
    const pp = f.porPagina ?? 50
    limite = ` limit ${p(pp)} offset ${p(((f.pagina ?? 1) - 1) * pp)}`
  } else limite = ' limit 100000'
  const linhas = await q<Registro>(`select t.*${selectCalculadas(def)} from ${def.tabela} t ${where} order by ${def.ordem}${limite}`, params, db)
  await anexarRotulos(def, linhas, db)
  return { linhas, total }
}

export async function anexarRotulos(def: EntidadeDef, linhas: Registro[], db: Db = pool()) {
  const refs = def.campos.filter((c): c is CampoDef & { ref: RefCadastro } => !!c.ref)
  for (const c of refs) {
    const mapa = await rotulosPorId(c.ref, linhas.map((l) => l[c.nome] as number).filter((x) => x != null), db)
    for (const l of linhas) {
      if (l[c.nome] != null) (l.__rotulos ??= {})[c.nome] = mapa.get(l[c.nome] as number) ?? `${CADASTROS[c.ref].nome} #${l[c.nome]}`
    }
  }
  // Números dos vínculos (chamado anterior etc.)
  for (const vc of def.vinculos ?? []) {
    const ids = linhas.map((l) => l[vc.coluna]).filter((x): x is number => typeof x === 'number')
    if (!ids.length) continue
    const rows = await q<{ id: number; numero: string }>(`select id, numero from ${vc.tabela} where id = any($1::int[])`, [ids], db)
    const m = new Map(rows.map((r) => [r.id, r.numero]))
    for (const l of linhas) if (l[vc.coluna] != null) (l.__vinculos ??= {})[vc.campoNumero] = m.get(l[vc.coluna] as number) ?? ''
  }
}

async function completarRegistro(db: Db, def: EntidadeDef, reg: Registro, o: { podeRestritos: boolean; pecas: boolean }): Promise<Registro> {
  await anexarRotulos(def, [reg], db)
  if (def.restrito && o.podeRestritos) {
    reg.__restritos = (await q1<Dados>(`select * from ${def.restrito.tabela} where ${def.restrito.chave} = $1`, [reg.id], db)) ?? null
  }
  if (def.pecas && o.pecas) reg.__pecas = JSON.stringify(await listarPecas(def.pecas, reg.id, db))
  return reg
}

export async function obterRegistro(def: EntidadeDef, id: number, o: { podeRestritos?: boolean } = {}): Promise<Registro | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const reg = await q1<Registro>(`select t.*${selectCalculadas(def)} from ${def.tabela} t where t.id = $1`, [id])
  if (!reg) return null
  return completarRegistro(pool(), def, reg, { podeRestritos: !!o.podeRestritos, pecas: true })
}

/* ------------------------------------------------------------------ */
/* Conversão registro -> valores de formulário                         */
/* ------------------------------------------------------------------ */

export function valorParaEntrada(c: Pick<CampoDef, 'tipo'>, v: unknown): string {
  if (v === null || v === undefined) return ''
  switch (c.tipo) {
    case 'dataHora':
      return paraDataHoraLocal(v as Date)
    case 'data':
      return String(v).slice(0, 10)
    case 'competencia':
      return String(v).slice(0, 7)
    case 'decimal':
    case 'moeda':
      return String(v).replace('.', ',')
    case 'bool':
    case 'boolNulo':
      return v ? 'true' : 'false'
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v)
    default:
      return String(v)
  }
}

export function registroParaEntrada(def: EntidadeDef, reg: Registro): Entrada {
  const e: Entrada = {}
  for (const c of def.campos) if (!c.virtual) e[c.nome] = valorParaEntrada(c, reg[c.nome])
  for (const vc of def.vinculos ?? []) e[vc.campoNumero] = reg.__vinculos?.[vc.campoNumero] ?? ''
  Object.assign(e, def.entradaVirtual?.(reg) ?? {})
  if (def.restrito && reg.__restritos) for (const c of def.restrito.campos) e[c.nome] = valorParaEntrada(c, reg.__restritos[c.nome])
  if (reg.__pecas !== undefined) e.pecas = reg.__pecas
  return e
}
