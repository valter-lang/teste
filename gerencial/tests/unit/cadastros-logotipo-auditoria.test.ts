import { describe, expect, it } from 'vitest'
import { validarArquivoLogotipo, problemaSvg, TAMANHO_MAXIMO_LOGO } from '@/lib/cadastros/logotipo'
import { diferencasAuditoria, mascararDadosPessoais } from '@/lib/cadastros/auditoria-diff'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const txt = (s: string) => new TextEncoder().encode(s)

describe('validação do logotipo', () => {
  it('aceita PNG/JPG com assinatura correta', () => {
    expect(validarArquivoLogotipo('logo.png', png)).toEqual({ ok: true, mime: 'image/png' })
    expect(validarArquivoLogotipo('LOGO.JPEG', jpg)).toEqual({ ok: true, mime: 'image/jpeg' })
  })
  it('recusa extensão não permitida, assinatura divergente e tamanho excessivo', () => {
    expect(validarArquivoLogotipo('logo.gif', png).ok).toBe(false)
    expect(validarArquivoLogotipo('logo.png', jpg).ok).toBe(false)
    expect(validarArquivoLogotipo('logo.jpg', png).ok).toBe(false)
    const grande = new Uint8Array(TAMANHO_MAXIMO_LOGO + 1)
    grande.set(png)
    expect(validarArquivoLogotipo('logo.png', grande).ok).toBe(false)
    expect(validarArquivoLogotipo('logo.png', new Uint8Array()).ok).toBe(false)
  })
  it('aceita SVG limpo e recusa conteúdo ativo', () => {
    expect(validarArquivoLogotipo('l.svg', txt('<?xml version="1.0"?>\n<!-- x --><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).ok).toBe(true)
    expect(problemaSvg('<svg><script>alert(1)</script></svg>')).toMatch(/script/)
    expect(problemaSvg('<svg onload="x()"></svg>')).toMatch(/on…=/)
    expect(problemaSvg('<svg><a href="javascript:alert(1)">x</a></svg>')).toMatch(/javascript/)
    expect(problemaSvg('<svg><foreignObject/></svg>')).toMatch(/foreignObject/)
    expect(problemaSvg('<svg><image href="https://x/y.png"/></svg>')).toMatch(/externas/)
    expect(validarArquivoLogotipo('l.svg', txt('<html><body/></html>')).ok).toBe(false)
    expect(validarArquivoLogotipo('l.svg', png).ok).toBe(false)
  })
})

describe('diferenças da auditoria', () => {
  it('UPDATE lista só campos alterados, sem carimbos técnicos', () => {
    const d = diferencasAuditoria({ id: 1, nome: 'A', ativo: true, atualizado_em: 'x' }, { id: 1, nome: 'B', ativo: true, atualizado_em: 'y' })
    expect(d).toEqual([{ campo: 'nome', antes: 'A', depois: 'B' }])
  })
  it('INSERT/DELETE listam campos preenchidos', () => {
    expect(diferencasAuditoria(null, { id: 1, nome: 'A', uf: null }).map((x) => x.campo)).toEqual(['id', 'nome'])
    expect(diferencasAuditoria({ id: 1, nome: 'A' }, null)).toEqual([{ campo: 'id', antes: 1, depois: undefined }, { campo: 'nome', antes: 'A', depois: undefined }])
  })
  it('nunca exibe e-mails, senhas ou IPs', () => {
    const m = mascararDadosPessoais({ email: 'a@b.com', senha_hash: 'h', obs: 'falar com joao@x.com.br', ip_abertura: '1.2.3.4', tipo: 'X' }) as Record<string, unknown>
    expect(m.email).toBe('[oculto]')
    expect(m.senha_hash).toBe('[oculto]')
    expect(m.ip_abertura).toBe('[oculto]')
    expect(m.obs).toBe('falar com [e-mail oculto]')
    expect(m.tipo).toBe('X')
  })
})
