/** Funções puras para exibir a trilha de auditoria sem dados pessoais. */

export interface Diferenca { campo: string; antes: unknown; depois: unknown }

const CHAVE_PESSOAL = /(e-?mail|senha|ramal|^ip_|_ip$|^ip$|telefone|cpf)/i
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const IGNORAR = new Set(['atualizado_em', 'versao'])

/** Remove chaves sensíveis e mascara e-mails em qualquer texto (recursivo). */
export function mascararDadosPessoais(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(EMAIL, '[e-mail oculto]')
  if (Array.isArray(v)) return v.map(mascararDadosPessoais)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      out[k] = CHAVE_PESSOAL.test(k) ? '[oculto]' : mascararDadosPessoais(x)
    }
    return out
  }
  return v
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Campos alterados entre antes e depois. INSERT: todos os campos preenchidos de "depois";
 * DELETE: todos de "antes"; UPDATE: apenas os que mudaram (ignorando carimbos técnicos).
 */
export function diferencasAuditoria(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): Diferenca[] {
  const a = (mascararDadosPessoais(antes ?? {}) ?? {}) as Record<string, unknown>
  const d = (mascararDadosPessoais(depois ?? {}) ?? {}) as Record<string, unknown>
  const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])]
  const out: Diferenca[] = []
  for (const c of campos) {
    if (antes && depois && IGNORAR.has(c)) continue
    if (antes && depois && igual(a[c], d[c])) continue
    if (!antes && (d[c] === null || d[c] === undefined)) continue
    if (!depois && (a[c] === null || a[c] === undefined)) continue
    out.push({ campo: c, antes: antes ? a[c] ?? null : undefined, depois: depois ? d[c] ?? null : undefined })
  }
  return out
}

/** Valor curto para exibição na tabela. */
export function valorCurto(v: unknown, max = 120): string {
  if (v === undefined) return ''
  if (v === null) return '∅'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > max ? s.slice(0, max) + '…' : s
}
