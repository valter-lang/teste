import 'server-only'
import { q1 } from '@/lib/db'

/**
 * Integração SOMENTE LEITURA com a base instalada (Protheus/AA3) espelhada no Supabase
 * (tabela bd_cl_inv). Nunca grava no Supabase: apenas requisições GET.
 *
 * Regra de soma (pendente de homologação): equipamentos = soma de QTD das linhas cujo
 * AA3_STATUS está na lista configurada ('integracao.base_instalada.status_ativos',
 * padrão ['01']); clientes = códigos distintos; lojas = pares Código+Loja distintos.
 * O significado dos status ('01' Ativo, '02' Em uso, '03' Manutenção, 'X1' Pendente)
 * vem do painel legado (supabase-client.js, obterBadgeStatus).
 */

export const CHAVE_STATUS_ATIVOS = 'integracao.base_instalada.status_ativos'
export const STATUS_ATIVOS_PADRAO = ['01']
export const TAMANHO_PAGINA_PADRAO = 1000

export interface ResultadoBaseInstalada { equipamentos: number; clientes: number; lojas: number }

export interface OpcoesLeitura {
  url?: string
  chave?: string
  statusAtivos?: string[]
  tamanhoPagina?: number
  fetch?: typeof fetch
  /** Limite de segurança de páginas (evita laço infinito). */
  maxPaginas?: number
  timeoutMs?: number
}

interface LinhaBdClInv { Codigo?: unknown; Loja?: unknown; QTD?: unknown; AA3_STATUS?: unknown }

export class ErroIntegracao extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'ErroIntegracao'
  }
}

export function integracaoConfigurada(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BASE_INSTALADA_SUPABASE_URL && !!env.BASE_INSTALADA_SUPABASE_KEY
}

/** '1', 1, '1,0', ' 2 ' -> número; inválido/ausente -> 0 */
export function quantidade(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v !== 'string') return 0
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/** Aplica a regra de soma a um conjunto de linhas (função pura). */
export function consolidarLinhas(linhas: LinhaBdClInv[], statusAtivos: string[]): ResultadoBaseInstalada {
  const ativos = new Set(statusAtivos.map((s) => s.trim().toUpperCase()))
  let equipamentos = 0
  const clientes = new Set<string>()
  const lojas = new Set<string>()
  for (const l of linhas) {
    if (!ativos.has(txt(l.AA3_STATUS).toUpperCase())) continue
    const qtd = quantidade(l.QTD)
    if (qtd <= 0) continue
    equipamentos += qtd
    const cod = txt(l.Codigo)
    if (cod) {
      clientes.add(cod)
      lojas.add(`${cod}|${txt(l.Loja)}`)
    }
  }
  return { equipamentos: Math.round(equipamentos), clientes: clientes.size, lojas: lojas.size }
}

/** Total informado em Content-Range ("0-999/5321" ou "*\/5321"), se houver. */
export function totalContentRange(h: string | null): number | null {
  const m = h?.match(/\/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

async function statusAtivosConfigurados(): Promise<string[]> {
  try {
    const r = await q1<{ valor: unknown }>('select valor from configuracao where chave = $1', [CHAVE_STATUS_ATIVOS])
    const v = r?.valor
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) return v as string[]
  } catch {
    /* sem banco disponível: usa o padrão */
  }
  return STATUS_ATIVOS_PADRAO
}

/**
 * Lê a base instalada paginando com cabeçalhos Range (PostgREST).
 * Lança ErroIntegracao com mensagem segura (sem expor a chave).
 */
export async function lerBaseInstaladaSupabase(opcoes: OpcoesLeitura = {}): Promise<ResultadoBaseInstalada> {
  const url = (opcoes.url ?? process.env.BASE_INSTALADA_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const chave = opcoes.chave ?? process.env.BASE_INSTALADA_SUPABASE_KEY ?? ''
  if (!url || !chave) throw new ErroIntegracao('Integração não configurada: defina BASE_INSTALADA_SUPABASE_URL e BASE_INSTALADA_SUPABASE_KEY.')
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) throw new ErroIntegracao('A URL da integração deve usar HTTPS.')
  const statusAtivos = opcoes.statusAtivos ?? (await statusAtivosConfigurados())
  const tamanho = opcoes.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO
  const maxPaginas = opcoes.maxPaginas ?? 500
  const f = opcoes.fetch ?? fetch
  const endpoint = `${url}/rest/v1/bd_cl_inv?select=Codigo,Loja,QTD,AA3_STATUS`

  const linhas: LinhaBdClInv[] = []
  let total: number | null = null
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * tamanho
    const ate = de + tamanho - 1
    let resp: Response
    try {
      resp = await f(endpoint, {
        method: 'GET',
        headers: {
          apikey: chave,
          Authorization: `Bearer ${chave}`,
          'Accept-Profile': 'public',
          Accept: 'application/json',
          'Range-Unit': 'items',
          Range: `${de}-${ate}`,
          Prefer: 'count=exact',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(opcoes.timeoutMs ?? 30_000),
      })
    } catch {
      throw new ErroIntegracao('Falha de rede ao consultar a base instalada (Supabase).')
    }
    if (resp.status === 416) break // intervalo além do fim
    if (!resp.ok) throw new ErroIntegracao(`A base instalada respondeu com erro HTTP ${resp.status}.`)
    const dados = (await resp.json()) as unknown
    if (!Array.isArray(dados)) throw new ErroIntegracao('Resposta inesperada da base instalada (não é uma lista).')
    linhas.push(...(dados as LinhaBdClInv[]))
    total ??= totalContentRange(resp.headers.get('content-range'))
    if (dados.length < tamanho) break
    if (total !== null && linhas.length >= total) break
    if (pagina === maxPaginas - 1) throw new ErroIntegracao('Limite de páginas atingido ao ler a base instalada.')
  }
  return consolidarLinhas(linhas, statusAtivos)
}
