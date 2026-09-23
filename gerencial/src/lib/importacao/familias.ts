/**
 * Mapeamento de textos livres da planilha para famílias de equipamento.
 * Puro (sem banco): recebe o catálogo (nome + sinônimos) como parâmetro.
 */

export interface FamiliaCatalogo {
  id?: number
  nome: string
  aliases: string[]
}

/** Catálogo padrão (espelha scripts/seed.ts) para análises sem banco. */
export const CATALOGO_FAMILIAS_PADRAO: FamiliaCatalogo[] = [
  { nome: 'FORNO', aliases: ['FONRO'] },
  { nome: 'CLIMATIZADORA', aliases: ['CLIMATICA', 'CLIMA'] },
  { nome: 'FREEZER', aliases: [] },
  { nome: 'ARMARIO/ESQUELETO', aliases: ['ARMARIOS / ESQUELETO', 'ARMARIOS/ESQUELETO'] },
  { nome: 'MINI CAMARA', aliases: ['MINI CAMERA', 'MINI CAMARA SEM GRADES 1980'] },
  { nome: 'ESTUFA', aliases: [] },
  { nome: 'TELA/BANDEJA', aliases: ['TELA / BANDEJA', 'TELA  / BANDEJA'] },
]

/** Maiúsculas, sem acentos, espaços colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Forma compacta para comparação: sem espaços ao redor de "/". */
const compacto = (s: string) => normalizarTexto(s).replace(/\s*\/\s*/g, '/')

export type ModoMapeamento = 'NOME' | 'ALIAS' | 'HEURISTICA' | 'AMBIGUO' | 'NENHUM'

export interface ResultadoMapeamento {
  familia: string | null
  modo: ModoMapeamento
}

function exato(chave: string, catalogo: FamiliaCatalogo[]): ResultadoMapeamento | null {
  const k = compacto(chave)
  for (const f of catalogo) if (compacto(f.nome) === k) return { familia: f.nome, modo: 'NOME' }
  for (const f of catalogo) if (f.aliases.some((a) => compacto(a) === k)) return { familia: f.nome, modo: 'ALIAS' }
  return null
}

/** Componentes reconhecíveis de uma família (partes do nome separadas por "/" e sinônimos). */
function componentes(f: FamiliaCatalogo): string[] {
  const partes = f.nome.split('/').map(normalizarTexto).filter(Boolean)
  return [...new Set([...partes, ...f.aliases.map(normalizarTexto), normalizarTexto(f.nome)])]
}

/** Família cujo componente inicia o texto (aceita plural com "S"). */
function porPrefixo(texto: string, catalogo: FamiliaCatalogo[]): string | null {
  let melhor: { nome: string; tam: number } | null = null
  for (const f of catalogo) {
    for (const c of componentes(f)) {
      const re = new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}S?(\\b|$)`)
      if (re.test(texto) && (!melhor || c.length > melhor.tam)) melhor = { nome: f.nome, tam: c.length }
    }
  }
  return melhor?.nome ?? null
}

/**
 * Resolve o texto: igualdade com nome/sinônimo; senão heurística por prefixo
 * (remove quantidade inicial, ex.: "6 ARMARIO 58X70"). Textos com mais de uma
 * família ("FORNO E FREEZER") são ambíguos.
 */
export function resolverFamilia(texto: string, catalogo: FamiliaCatalogo[]): ResultadoMapeamento {
  const n = normalizarTexto(texto)
  if (!n) return { familia: null, modo: 'NENHUM' }
  const e = exato(n, catalogo)
  if (e) return e
  const semQtd = n.replace(/^\d+\s+/, '')
  const partes = semQtd.split(/\s+E\s+|\s*\+\s*|\s*,\s*/).filter(Boolean)
  if (partes.length > 1) {
    const fams = new Set(partes.map((p) => exato(p, catalogo)?.familia ?? porPrefixo(p, catalogo)).filter(Boolean))
    if (fams.size > 1) return { familia: null, modo: 'AMBIGUO' }
  }
  const h = exato(semQtd, catalogo)?.familia ?? porPrefixo(semQtd, catalogo)
  return h ? { familia: h, modo: 'HEURISTICA' } : { familia: null, modo: 'NENHUM' }
}
