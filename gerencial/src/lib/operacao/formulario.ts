import 'server-only'
import { q } from '@/lib/db'
import { carregarOpcoes, type RefCadastro } from './cadastros'
import type { CampoDef, EntidadeDef } from './entidades'
import type { Registro } from './crud'
import type { CampoCliente, LinhaPecaEntrada, Opcao } from './tipos'

type OpcoesRef = Partial<Record<RefCadastro, Opcao[]>>

export function paraCliente(c: CampoDef, opcoes: OpcoesRef): CampoCliente {
  return {
    nome: c.nome,
    rotulo: c.rotulo,
    tipo: c.tipo,
    obrigatorio: c.obrigatorio,
    ajuda: c.ajuda,
    largo: c.largo,
    grupo: c.grupo,
    somenteLeitura: c.somenteLeitura,
    opcoes: c.tipo === 'enum'
      ? (c.opcoes ?? []).map((v) => ({ valor: v, rotulo: c.rotulosOpcoes?.[v] ?? v }))
      : c.ref ? opcoes[c.ref] ?? [] : undefined,
  }
}

/** Campos prontos para o cliente, com opções de cadastro (ativos + os já usados pelos registros). */
export async function camposComOpcoes(campos: CampoDef[], registros: Registro[] = []): Promise<CampoCliente[]> {
  const refs = campos.filter((c) => c.ref).map((c) => c.ref!)
  const incluir: Partial<Record<RefCadastro, number[]>> = {}
  for (const c of campos) {
    if (!c.ref) continue
    for (const r of registros) if (typeof r[c.nome] === 'number') (incluir[c.ref] ??= []).push(r[c.nome] as number)
  }
  const opcoes = refs.length ? await carregarOpcoes(refs, incluir) : {}
  return campos.map((c) => paraCliente(c, opcoes))
}

/** Opções do editor de peças, incluindo cadastros inativos já usados nas linhas. */
export async function opcoesPecas(linhasJson?: string) {
  let linhas: LinhaPecaEntrada[] = []
  try {
    linhas = linhasJson ? JSON.parse(linhasJson) : []
  } catch {}
  const ids = (k: keyof LinhaPecaEntrada) => linhas.map((l) => Number(l[k])).filter((n) => n > 0)
  const o = await carregarOpcoes(['familia_peca', 'item_peca', 'local_estoque'], {
    familia_peca: ids('familia_id'), item_peca: ids('item_peca_id'), local_estoque: ids('local_estoque_id'),
  })
  return { familias: o.familia_peca ?? [], itens: o.item_peca ?? [], locais: o.local_estoque ?? [] }
}

/** Nomes dos usuários (criado/atualizado/excluído por). */
export async function nomesUsuarios(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => !!x))]
  if (!u.length) return new Map()
  const r = await q<{ id: string; nome: string }>('select id, nome from usuario where id = any($1::uuid[])', [u])
  return new Map(r.map((x) => [x.id, x.nome]))
}

export const entidadeTemCompetencia = (d: EntidadeDef) => !d.semCompetencia
