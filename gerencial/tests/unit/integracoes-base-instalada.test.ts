import { describe, expect, it, vi } from 'vitest'
import { consolidarLinhas, ErroIntegracao, lerBaseInstaladaSupabase, totalContentRange } from '@/lib/integracoes/base-instalada'

type Linha = { Codigo: string; Loja: string; QTD: unknown; AA3_STATUS: string }

/** fetch simulado de um PostgREST que respeita o cabeçalho Range. */
function fetchSimulado(linhas: Linha[], opcoes: { comTotal?: boolean } = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    const [de, ate] = (h.get('Range') ?? '0-999').split('-').map(Number)
    if (de >= linhas.length && linhas.length > 0) return new Response('', { status: 416 })
    const pagina = linhas.slice(de, ate + 1)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (opcoes.comTotal) headers['content-range'] = `${de}-${de + pagina.length - 1}/${linhas.length}`
    return new Response(JSON.stringify(pagina), { status: 206, headers })
  })
}

const base: Linha[] = [
  { Codigo: '000001', Loja: '01', QTD: 2, AA3_STATUS: '01' },
  { Codigo: '000001', Loja: '02', QTD: '3', AA3_STATUS: '01' },
  { Codigo: '000002', Loja: '01', QTD: 1, AA3_STATUS: '03' }, // manutenção: fora
  { Codigo: '000003', Loja: '01', QTD: '1,0', AA3_STATUS: '02' },
  { Codigo: '000004', Loja: '01', QTD: 0, AA3_STATUS: '01' }, // qtd zero: fora
  { Codigo: '000005', Loja: '01', QTD: 4, AA3_STATUS: 'X1' },
]

describe('regra de soma da base instalada', () => {
  it('soma QTD apenas dos status ativos configurados', () => {
    expect(consolidarLinhas(base, ['01'])).toEqual({ equipamentos: 5, clientes: 1, lojas: 2 })
    expect(consolidarLinhas(base, ['01', '02'])).toEqual({ equipamentos: 6, clientes: 2, lojas: 3 })
    expect(consolidarLinhas(base, ['x1'])).toEqual({ equipamentos: 4, clientes: 1, lojas: 1 })
  })
  it('lê Content-Range', () => {
    expect(totalContentRange('0-999/5321')).toBe(5321)
    expect(totalContentRange('*/0')).toBe(0)
    expect(totalContentRange(null)).toBeNull()
  })
})

describe('lerBaseInstaladaSupabase (fetch simulado)', () => {
  const opc = { url: 'https://proj.supabase.co/', chave: 'chave-secreta', statusAtivos: ['01'] }

  it('pagina com Range e usa somente GET com cabeçalhos corretos', async () => {
    const muitas: Linha[] = Array.from({ length: 2345 }, (_, i) => ({ Codigo: String(i % 700), Loja: String(i % 3), QTD: 1, AA3_STATUS: i % 5 === 0 ? '03' : '01' }))
    const f = fetchSimulado(muitas)
    const r = await lerBaseInstaladaSupabase({ ...opc, tamanhoPagina: 1000, fetch: f as unknown as typeof fetch })
    expect(f).toHaveBeenCalledTimes(3)
    const ranges = f.mock.calls.map(([, init]) => new Headers(init?.headers).get('Range'))
    expect(ranges).toEqual(['0-999', '1000-1999', '2000-2999'])
    for (const [url, init] of f.mock.calls) {
      expect(String(url)).toBe('https://proj.supabase.co/rest/v1/bd_cl_inv?select=Codigo,Loja,QTD,AA3_STATUS')
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      const h = new Headers(init?.headers)
      expect(h.get('apikey')).toBe('chave-secreta')
      expect(h.get('Authorization')).toBe('Bearer chave-secreta')
      expect(h.get('Accept-Profile')).toBe('public')
      expect(h.get('Content-Profile')).toBeNull()
    }
    expect(r).toEqual(consolidarLinhas(muitas, ['01']))
    expect(r.equipamentos).toBe(2345 - 469)
  })

  it('para ao atingir o total informado e trata 416', async () => {
    const f = fetchSimulado(base.concat(base), { comTotal: true })
    const r = await lerBaseInstaladaSupabase({ ...opc, tamanhoPagina: 6, fetch: f as unknown as typeof fetch })
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.equipamentos).toBe(10)
    const f416 = fetchSimulado(base.slice(0, 4))
    await lerBaseInstaladaSupabase({ ...opc, tamanhoPagina: 2, fetch: f416 as unknown as typeof fetch })
    expect(f416).toHaveBeenCalledTimes(3) // 0-1, 2-3, 4-5 (416)
  })

  it('nunca executa POST/PATCH/PUT/DELETE', async () => {
    const metodos: string[] = []
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      metodos.push(init?.method ?? 'GET')
      return new Response('[]', { status: 200 })
    })
    await lerBaseInstaladaSupabase({ ...opc, fetch: f as unknown as typeof fetch })
    expect(metodos).toEqual(['GET'])
    expect(metodos.some((m) => /POST|PATCH|PUT|DELETE/i.test(m))).toBe(false)
  })

  it('erros não expõem a chave', async () => {
    const f = vi.fn(async () => new Response('{"message":"JWT chave-secreta inválido"}', { status: 401 }))
    const e = await lerBaseInstaladaSupabase({ ...opc, fetch: f as unknown as typeof fetch }).catch((x) => x)
    expect(e).toBeInstanceOf(ErroIntegracao)
    expect(String(e.message)).not.toContain('chave-secreta')
    const rede = vi.fn(async () => { throw new Error('ECONNREFUSED chave-secreta') })
    const e2 = await lerBaseInstaladaSupabase({ ...opc, fetch: rede as unknown as typeof fetch }).catch((x) => x)
    expect(String(e2.message)).not.toContain('chave-secreta')
  })

  it('exige configuração e HTTPS', async () => {
    await expect(lerBaseInstaladaSupabase({ url: '', chave: '', statusAtivos: ['01'] })).rejects.toThrow(/não configurada/)
    await expect(lerBaseInstaladaSupabase({ url: 'http://exemplo.com', chave: 'k', statusAtivos: ['01'] })).rejects.toThrow(/HTTPS/)
  })

  it('recusa resposta que não é lista', async () => {
    const f = vi.fn(async () => new Response('{"a":1}', { status: 200 }))
    await expect(lerBaseInstaladaSupabase({ ...opc, fetch: f as unknown as typeof fetch })).rejects.toThrow(/não é uma lista/)
  })
})
