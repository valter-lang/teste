import 'server-only'
import type { PoolClient } from 'pg'
import { q, q1, tx, type Db } from '@/lib/db'
import { REFERENCIAS, type ChaveReferencia, type EntidadeDef } from './definicoes'
import { validarEntrada, type Valor } from './validacao'
import { ErroNegocio, mensagemAmigavel } from './erros'

/**
 * Motor genérico dos cadastros. Os nomes de tabela/coluna vêm SOMENTE das definições
 * estáticas (nunca da entrada do usuário); valores sempre por parâmetros.
 */

export const POR_PAGINA = 20
export type FiltroStatus = 'ativos' | 'inativos' | 'todos'

export interface FiltrosLista {
  busca?: string
  status?: FiltroStatus
  pagina?: number
  porPagina?: number
  /** Filtros de igualdade adicionais em campos de referência (ex.: cliente_id). */
  igual?: Record<string, number>
}

export type Linha = Record<string, unknown> & { id: number; ativo: boolean; _rotulo: string }

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Identificador inválido: ${s}`)
  return s
}

function colunasSelect(def: EntidadeDef): string {
  const refs = def.campos
    .filter((c) => c.tipo === 'referencia' && c.referencia)
    .map((c) => {
      const r = REFERENCIAS[c.referencia!]
      return `(select ${r.rotulo} from ${ident(r.tabela)} r_ where r_.id = t.${ident(c.nome)}) as ${ident(c.nome)}__rotulo`
    })
  // A expressão de rótulo da entidade usa colunas sem qualificação (única tabela no FROM)
  return ['t.*', `(${def.rotulo}) as _rotulo`, ...refs].join(', ')
}

export async function listarCadastro(def: EntidadeDef, f: FiltrosLista = {}, db?: Db) {
  const porPagina = f.porPagina ?? POR_PAGINA
  const pagina = Math.max(1, f.pagina ?? 1)
  const params: unknown[] = []
  const where: string[] = []
  const status = f.status ?? 'ativos'
  if (status === 'ativos') where.push('t.ativo')
  if (status === 'inativos') where.push('not t.ativo')
  if (f.busca) {
    params.push(`%${f.busca.replace(/[\\%_]/g, (m) => '\\' + m)}%`)
    where.push('(' + def.busca.map((c) => `t.${ident(c)}::text ilike $${params.length}`).join(' or ') + ')')
  }
  for (const [campo, valor] of Object.entries(f.igual ?? {})) {
    if (!def.campos.some((c) => c.nome === campo)) continue
    params.push(valor)
    where.push(`t.${ident(campo)} = $${params.length}`)
  }
  const w = where.length ? 'where ' + where.join(' and ') : ''
  const ordem = def.ordem.split(',').map((p) => 't.' + p.trim()).join(', ').replace(/t\.upper\((\w+)\)/g, 'upper(t.$1)')
  const total = await q1<{ n: number }>(`select count(*)::int as n from ${ident(def.tabela)} t ${w}`, params, db)
  const linhas = await q<Linha>(
    `select ${colunasSelect(def)} from ${ident(def.tabela)} t ${w} order by ${ordem} limit ${porPagina} offset ${(pagina - 1) * porPagina}`,
    params, db,
  )
  return { linhas, total: total?.n ?? 0, pagina, porPagina }
}

export async function obterCadastro(def: EntidadeDef, id: number, db?: Db): Promise<Linha | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const r = await q1<Linha>(`select ${colunasSelect(def)} from ${ident(def.tabela)} t where t.id = $1`, [id], db)
  return r ?? null
}

/** Opções para seleção de referência: apenas ativos, mais os valores já selecionados (mesmo que inativos). */
export async function opcoesReferencia(chave: ChaveReferencia, incluirIds: number[] = [], limite = 3000, db?: Db) {
  const r = REFERENCIAS[chave]
  return q<{ id: number; rotulo: string; ativo: boolean }>(
    `select id, ${r.rotulo} as rotulo, ativo from ${ident(r.tabela)}
      where ativo or id = any($1::int[]) order by ${r.ordem} limit ${limite}`,
    [incluirIds], db,
  )
}

async function verificarReferencias(def: EntidadeDef, dados: Record<string, Valor>, anterior: Record<string, unknown> | null, db: PoolClient) {
  for (const c of def.campos) {
    if (c.tipo !== 'referencia' || !c.referencia) continue
    const v = dados[c.nome]
    if (v === null || v === undefined) continue
    if (anterior && Number(anterior[c.nome]) === Number(v)) continue // valor mantido: não é nova utilização
    const r = await q1<{ ativo: boolean }>(`select ativo from ${ident(REFERENCIAS[c.referencia].tabela)} where id = $1`, [v], db)
    if (!r) throw new ErroNegocio(`${c.rotulo}: cadastro inexistente.`, c.nome)
    if (!r.ativo) throw new ErroNegocio(`${c.rotulo}: o cadastro selecionado está desativado e não pode ser usado em novos vínculos.`, c.nome)
  }
  if (def.tabela === 'equipamento' && dados.modelo_id) {
    const m = await q1<{ familia_id: number }>('select familia_id from modelo_equipamento where id = $1', [dados.modelo_id], db)
    if (m && m.familia_id !== Number(dados.familia_id)) throw new ErroNegocio('O modelo selecionado não pertence à família escolhida.', 'modelo_id')
  }
}

async function verificarUnicosAplicacao(def: EntidadeDef, dados: Record<string, Valor>, id: number | null, db: PoolClient) {
  for (const u of def.unicosAplicacao ?? []) {
    const v = dados[u.campo]
    if (v === null || v === undefined || v === '') continue
    const col = u.ignorarCaixa ? `upper(${ident(u.campo)}::text)` : ident(u.campo)
    const par = u.ignorarCaixa ? String(v).toUpperCase() : v
    // Serializa verificações concorrentes do mesmo valor
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`${def.tabela}.${u.campo}.${String(par)}`])
    const r = await q1(`select 1 from ${ident(def.tabela)} where ${col} = $1 and id <> $2 limit 1`, [par, id ?? 0], db)
    if (r) throw new ErroNegocio(u.mensagem, u.campo)
  }
}

export type ResultadoSalvar = { ok: true; id: number } | { ok: false; erro?: string; erros?: Record<string, string> }

/** Cria (id nulo) ou atualiza um cadastro, validando e registrando o usuário na auditoria. */
export async function salvarCadastro(def: EntidadeDef, id: number | null, entrada: Record<string, unknown>, usuarioId: string): Promise<ResultadoSalvar> {
  const v = validarEntrada(def, entrada)
  if (!v.ok) return { ok: false, erros: v.erros }
  const cols = def.campos.map((c) => c.nome)
  try {
    const novoId = await tx({ usuarioId }, async (db) => {
      let anterior: Record<string, unknown> | null = null
      if (id !== null) {
        anterior = (await q1(`select * from ${ident(def.tabela)} where id = $1 for update`, [id], db)) ?? null
        if (!anterior) throw new ErroNegocio('Cadastro não encontrado.')
      }
      await verificarReferencias(def, v.dados, anterior, db)
      await verificarUnicosAplicacao(def, v.dados, id, db)
      const valores = cols.map((c) => v.dados[c])
      if (id === null) {
        const r = await q1<{ id: number }>(
          `insert into ${ident(def.tabela)} (${cols.map(ident).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
          valores, db)
        return r!.id
      }
      await db.query(`update ${ident(def.tabela)} set ${cols.map((c, i) => `${ident(c)} = $${i + 2}`).join(', ')} where id = $1`, [id, ...valores])
      return id
    })
    return { ok: true, id: novoId }
  } catch (e) {
    const campo = e instanceof ErroNegocio ? e.campo : undefined
    const msg = mensagemAmigavel(e, def.unicos)
    return campo ? { ok: false, erros: { [campo]: msg } } : { ok: false, erro: msg }
  }
}

/**
 * Desativa (ativo=false e, quando existe, valido_ate=hoje) ou reativa um cadastro.
 * Nunca exclui fisicamente: o histórico que referencia o cadastro é preservado.
 */
export async function alterarAtivoCadastro(def: EntidadeDef, id: number, ativo: boolean, usuarioId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await tx({ usuarioId }, async (db) => {
      const extra = def.temValidoAte ? (ativo ? ', valido_ate = null' : ", valido_ate = (now() at time zone 'America/Sao_Paulo')::date") : ''
      const r = await db.query(`update ${ident(def.tabela)} set ativo = $2${extra} where id = $1`, [id, ativo])
      if (!r.rowCount) throw new ErroNegocio('Cadastro não encontrado.')
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, def.unicos) }
  }
}

/* ------------------------------------------------------------------ */
/* Sinônimos de família de equipamento (usados pelo importador)        */
/* ------------------------------------------------------------------ */

export const normalizarAlias = (s: string) => s.trim().toUpperCase()

export async function listarAliases(familiaId: number, db?: Db) {
  return q<{ alias: string }>('select alias from familia_equipamento_alias where familia_id = $1 order by alias', [familiaId], db)
}

export async function adicionarAlias(familiaId: number, alias: string, usuarioId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const a = normalizarAlias(alias)
  if (!a) return { ok: false, erro: 'Informe o sinônimo.' }
  if (a.length > 120) return { ok: false, erro: 'Sinônimo muito longo (máximo 120 caracteres).' }
  try {
    await tx({ usuarioId }, async (db) => {
      const f = await q1<{ nome: string }>('select nome from familia_equipamento where id = $1', [familiaId], db)
      if (!f) throw new ErroNegocio('Família não encontrada.')
      if (f.nome.toUpperCase() === a) throw new ErroNegocio('O sinônimo é igual ao nome da família.')
      await db.query('insert into familia_equipamento_alias (alias, familia_id) values ($1, $2)', [a, familiaId])
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, { familia_equipamento_alias_pkey: 'Este sinônimo já está associado a uma família de equipamento.' }) }
  }
}

/** Remove o vínculo de sinônimo (registro de mapeamento sem histórico próprio; a remoção fica na auditoria). */
export async function removerAlias(familiaId: number, alias: string, usuarioId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await tx({ usuarioId }, (db) => db.query('delete from familia_equipamento_alias where familia_id = $1 and alias = $2', [familiaId, alias]))
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/** Contagem de cadastros ativos por entidade (índice /cadastros). */
export async function contagensCadastros(defs: EntidadeDef[], db?: Db) {
  const sql = defs.map((d) => `select '${d.slug}' as slug, count(*) filter (where ativo)::int as ativos, count(*)::int as total from ${ident(d.tabela)}`).join(' union all ')
  const rows = await q<{ slug: string; ativos: number; total: number }>(sql, [], db)
  return Object.fromEntries(rows.map((r) => [r.slug, r]))
}
