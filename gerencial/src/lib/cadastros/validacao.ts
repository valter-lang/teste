import { z } from 'zod'
import { UFS, type CampoDef, type EntidadeDef } from './definicoes'

export type Valor = string | number | boolean | null
export type ResultadoValidacao =
  | { ok: true; dados: Record<string, Valor> }
  | { ok: false; erros: Record<string, string> }

/** '1.234,5' -> 1234.5 ; '0,125' -> 0.125 ; '12.5' -> 12.5 (sem vírgula, o ponto é decimal). */
export function numeroDecimal(s: string): string {
  return s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim()

/** Esquema zod de um campo a partir da entrada crua de formulário (string/checkbox). */
function esquemaCampo(c: CampoDef): z.ZodType<Valor> {
  const vazio = (s: string) => s === ''
  const obrig = `Informe ${c.rotulo.toLowerCase()}.`
  switch (c.tipo) {
    case 'booleano':
      return z.unknown().transform((v) => v === true || v === 'on' || v === 'true' || v === '1')
    case 'texto':
      return z.unknown().transform(texto).pipe(
        z.string()
          .max(c.max ?? 500, `${c.rotulo}: máximo de ${c.max ?? 500} caracteres.`)
          .refine((s) => !c.obrigatorio || !vazio(s), obrig)
          .transform((s) => (vazio(s) ? null : c.maiusculas ? s.toUpperCase() : s)),
      )
    case 'uf':
      return z.unknown().transform((v) => texto(v).toUpperCase()).pipe(
        z.string()
          .refine((s) => !c.obrigatorio || !vazio(s), obrig)
          .refine((s) => vazio(s) || UFS.includes(s), 'UF inválida.')
          .transform((s) => (vazio(s) ? null : s)),
      )
    case 'selecao':
      return z.unknown().transform(texto).pipe(
        z.string()
          .refine((s) => !c.obrigatorio || !vazio(s), obrig)
          .refine((s) => vazio(s) || !!c.opcoes?.some((o) => o.valor === s), `${c.rotulo}: opção inválida.`)
          .transform((s) => (vazio(s) ? null : s)),
      )
    case 'referencia':
      return z.unknown().transform(texto).pipe(
        z.string()
          .refine((s) => !c.obrigatorio || !vazio(s), `Selecione ${c.rotulo.toLowerCase()}.`)
          .refine((s) => vazio(s) || /^\d{1,9}$/.test(s), `${c.rotulo}: seleção inválida.`)
          .transform((s) => (vazio(s) ? null : Number(s))),
      )
    case 'data':
      return z.unknown().transform(texto).pipe(
        z.string()
          .refine((s) => !c.obrigatorio || !vazio(s), obrig)
          .refine((s) => vazio(s) || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))), `${c.rotulo}: data inválida.`)
          .transform((s) => (vazio(s) ? null : s)),
      )
    case 'inteiro':
    case 'decimal': {
      const inteiro = c.tipo === 'inteiro'
      return z.unknown().transform((v) => texto(v).replace(/\s/g, '')).pipe(
        z.string()
          .refine((s) => !c.obrigatorio || !vazio(s), obrig)
          .transform((s) => (vazio(s) ? null : Number(inteiro ? s : numeroDecimal(s))))
          .refine((n) => n === null || Number.isFinite(n), `${c.rotulo}: número inválido.`)
          .refine((n) => n === null || !inteiro || Number.isInteger(n), `${c.rotulo}: informe um número inteiro.`)
          .refine((n) => n === null || c.min === undefined || n >= c.min, `${c.rotulo}: deve ser maior ou igual a ${c.min}.`)
          .refine((n) => n === null || Math.abs(n) < 1e11, `${c.rotulo}: valor muito grande.`),
      )
    }
  }
}

/** Regras entre campos específicas de cada cadastro. */
function regrasCruzadas(def: EntidadeDef, d: Record<string, Valor>): Record<string, string> {
  const erros: Record<string, string> = {}
  if (def.tabela === 'contrato_comodato' && d.inicio && d.fim && String(d.fim) < String(d.inicio)) {
    erros.fim = 'A data de fim deve ser igual ou posterior à data de início.'
  }
  if (def.tabela === 'equipamento') {
    if (!d.patrimonio && !d.serial) erros.patrimonio = 'Informe o patrimônio ou o número de série.'
    if (d.situacao === 'EM_CLIENTE' && !d.cliente_id) erros.cliente_id = 'Informe o cliente atual para equipamento em cliente.'
  }
  if (def.tabela === 'unidade' && d.codigo && !/^[A-Z0-9_-]+$/.test(String(d.codigo))) {
    erros.codigo = 'Use apenas letras, números, hífen e sublinhado (sem espaços).'
  }
  return erros
}

/** Valida e converte a entrada crua (FormData convertido em objeto) para os tipos do banco. */
export function validarEntrada(def: EntidadeDef, entrada: Record<string, unknown>): ResultadoValidacao {
  const dados: Record<string, Valor> = {}
  const erros: Record<string, string> = {}
  for (const c of def.campos) {
    const r = esquemaCampo(c).safeParse(entrada[c.nome])
    if (r.success) dados[c.nome] = r.data
    else erros[c.nome] = r.error.issues[0]?.message ?? 'Valor inválido.'
  }
  if (Object.keys(erros).length) return { ok: false, erros }
  const cruzados = regrasCruzadas(def, dados)
  if (Object.keys(cruzados).length) return { ok: false, erros: cruzados }
  return { ok: true, dados }
}

/** Converte FormData em objeto simples (checkbox ausente => false). */
export function formParaObjeto(def: EntidadeDef, fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const c of def.campos) {
    const v = fd.get(c.nome)
    o[c.nome] = c.tipo === 'booleano' ? v === 'on' || v === 'true' : typeof v === 'string' ? v : null
  }
  return o
}
