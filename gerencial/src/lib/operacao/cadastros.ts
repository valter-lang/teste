import 'server-only'
import { pool, q, type Db } from '@/lib/db'
import type { Opcao } from './tipos'

/** Cadastros referenciados pelos lançamentos. Expressões SQL fixas (nunca vêm do usuário). */
export type RefCadastro =
  | 'unidade' | 'cliente' | 'familia_equipamento' | 'modelo_equipamento' | 'equipamento' | 'tecnico'
  | 'familia_peca' | 'item_peca' | 'local_estoque' | 'ti_sistema' | 'ti_projeto'

interface DefCadastro {
  tabela: string
  rotulo: string
  /** Colunas comparadas (sem caixa/acento) na resolução por nome ao colar linhas. */
  busca: string[]
  ativo: string
  validoAte?: boolean
  nome: string
}

const ATIVO = 'ativo'
export const CADASTROS: Record<RefCadastro, DefCadastro> = {
  unidade: { tabela: 'unidade', rotulo: 'nome', busca: ['nome', 'codigo'], ativo: ATIVO, nome: 'Unidade' },
  cliente: {
    tabela: 'cliente', rotulo: `fantasia || coalesce(' (' || codigo_externo || ')', '')`,
    busca: ['fantasia', 'razao_social', 'codigo_externo'], ativo: ATIVO, validoAte: true, nome: 'Cliente',
  },
  familia_equipamento: { tabela: 'familia_equipamento', rotulo: 'nome', busca: ['nome'], ativo: ATIVO, nome: 'Família de equipamento' },
  modelo_equipamento: {
    tabela: 'modelo_equipamento',
    rotulo: `(select f.nome from familia_equipamento f where f.id = modelo_equipamento.familia_id) || ' — ' || nome`,
    busca: ['nome'], ativo: ATIVO, nome: 'Modelo',
  },
  equipamento: {
    tabela: 'equipamento', rotulo: `coalesce(patrimonio, serial, 'Equipamento #' || id)`,
    busca: ['patrimonio', 'serial'], ativo: ATIVO, nome: 'Equipamento',
  },
  tecnico: { tabela: 'tecnico', rotulo: 'nome', busca: ['nome'], ativo: ATIVO, validoAte: true, nome: 'Técnico' },
  familia_peca: { tabela: 'familia_peca', rotulo: 'nome', busca: ['nome'], ativo: ATIVO, nome: 'Família de peça' },
  item_peca: { tabela: 'item_peca', rotulo: `coalesce(codigo || ' — ', '') || descricao`, busca: ['codigo', 'descricao'], ativo: ATIVO, nome: 'Item de peça' },
  local_estoque: { tabela: 'local_estoque', rotulo: 'nome', busca: ['nome'], ativo: ATIVO, nome: 'Local de estoque' },
  ti_sistema: { tabela: 'ti_sistema', rotulo: 'nome', busca: ['nome'], ativo: ATIVO, nome: 'Sistema' },
  ti_projeto: { tabela: 'ti_projeto', rotulo: 'nome', busca: ['nome'], ativo: `excluido_em is null and status not in ('CANCELADO','CONCLUIDO')`, nome: 'Projeto' },
}

const condAtivo = (d: DefCadastro, dataParam: string) =>
  `(${d.ativo}${d.validoAte ? ` and (valido_ate is null or valido_ate >= ${dataParam})` : ''})`

/**
 * Opções para selects: somente cadastros ativos, mais os já usados pelo(s) registro(s)
 * exibido(s) (marcados como inativos), para que registros antigos continuem legíveis.
 */
export async function carregarOpcoes(
  refs: RefCadastro[], incluir: Partial<Record<RefCadastro, number[]>> = {},
): Promise<Partial<Record<RefCadastro, Opcao[]>>> {
  const out: Partial<Record<RefCadastro, Opcao[]>> = {}
  await Promise.all(
    [...new Set(refs)].map(async (r) => {
      const d = CADASTROS[r]
      const ids = (incluir[r] ?? []).filter((x) => Number.isInteger(x))
      const rows = await q<{ id: number; rotulo: string; ativo: boolean }>(
        `select id, ${d.rotulo} as rotulo, ${condAtivo(d, 'current_date')} as ativo
           from ${d.tabela}
          where ${condAtivo(d, 'current_date')} or id = any($1::int[])
          order by 2 limit 5000`,
        [ids],
      )
      out[r] = rows.map((x) => ({ valor: String(x.id), rotulo: x.ativo ? x.rotulo : `${x.rotulo} (inativo)`, inativo: !x.ativo || undefined }))
    }),
  )
  return out
}

/** Rótulos por id (para listas e exportação). */
export async function rotulosPorId(ref: RefCadastro, ids: number[], db: Db = pool()): Promise<Map<number, string>> {
  const unicos = [...new Set(ids.filter((x) => Number.isInteger(x)))]
  if (!unicos.length) return new Map()
  const d = CADASTROS[ref]
  const rows = await q<{ id: number; rotulo: string }>(`select id, ${d.rotulo} as rotulo from ${d.tabela} where id = any($1::int[])`, [unicos], db)
  return new Map(rows.map((r) => [r.id, r.rotulo]))
}

const ACENTOS = ['áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc']
const semAcento = (expr: string) => `translate(lower(${expr}), '${ACENTOS[0]}', '${ACENTOS[1]}')`

/** Resolve um nome colado (ex.: "Refrigerador") para o id do cadastro. */
export async function resolverPorNome(db: Db, ref: RefCadastro, texto: string): Promise<{ id?: number; erro?: string }> {
  const d = CADASTROS[ref]
  const t = texto.trim()
  if (/^#\d+$/.test(t)) return { id: Number(t.slice(1)) }
  const conds = d.busca.map((c) => `${semAcento(`trim(${c})`)} = ${semAcento('$1')}`).join(' or ')
  let rows = await q<{ id: number }>(`select id from ${d.tabela} where ${conds} limit 2`, [t], db)
  if (!rows.length && ref === 'familia_equipamento') {
    rows = await q<{ id: number }>('select familia_id as id from familia_equipamento_alias where upper(alias) = upper($1) limit 2', [t], db)
  }
  if (rows.length === 1) return { id: rows[0].id }
  if (rows.length > 1) return { erro: `"${t}" corresponde a mais de um cadastro de ${d.nome.toLowerCase()}; use o código.` }
  return { erro: `${d.nome} "${t}" não encontrado(a) nos cadastros.` }
}

/**
 * Cadastro precisa estar ativo (e vigente na data do evento) para novas utilizações.
 * Retorna a mensagem de erro, ou null quando válido.
 */
export async function verificarAtivo(db: Db, ref: RefCadastro, id: number, dataEvento: string | null): Promise<string | null> {
  const d = CADASTROS[ref]
  const r = await q<{ ok: boolean; rotulo: string }>(
    `select ${condAtivo(d, 'coalesce($2::date, current_date)')} as ok, ${d.rotulo} as rotulo, $2::date as data_ref from ${d.tabela} where id = $1`,
    [id, dataEvento], db,
  )
  if (!r.length) return `${d.nome} inexistente.`
  if (!r[0].ok) return `${d.nome} "${r[0].rotulo}" está inativo(a) ou fora da vigência${dataEvento ? ' na data do evento' : ''}.`
  return null
}
