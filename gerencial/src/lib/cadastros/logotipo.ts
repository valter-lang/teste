/**
 * Validação do arquivo oficial do logotipo. O sistema apenas armazena o arquivo
 * aprovado enviado pelo administrador; nunca gera nem redesenha o logotipo.
 */
export const TAMANHO_MAXIMO_LOGO = 2 * 1024 * 1024

export type ResultadoLogo = { ok: true; mime: 'image/png' | 'image/jpeg' | 'image/svg+xml' } | { ok: false; erro: string }

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPG = [0xff, 0xd8, 0xff]

const comeca = (b: Uint8Array, assinatura: number[]) => assinatura.every((x, i) => b[i] === x)

/** Motivo de rejeição de um SVG (conteúdo ativo), ou null se seguro. */
export function problemaSvg(texto: string): string | null {
  const t = texto.replace(/^﻿/, '')
  // Início esperado: declaração XML, comentários, DOCTYPE e então <svg
  const semPreambulo = t.replace(/^\s*(<\?xml[\s\S]*?\?>\s*)?((<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*/i, '')
  if (!/^<svg[\s>]/i.test(semPreambulo)) return 'O arquivo não é um SVG válido (elemento <svg> não encontrado no início).'
  if (/<script/i.test(t)) return 'SVG com <script> não é permitido.'
  if (/\son[a-z]+\s*=/i.test(t)) return 'SVG com atributos de evento (on…=) não é permitido.'
  if (/javascript\s*:/i.test(t)) return 'SVG com links "javascript:" não é permitido.'
  if (/<foreignObject/i.test(t)) return 'SVG com <foreignObject> não é permitido.'
  if (/<!ENTITY/i.test(t)) return 'SVG com entidades XML não é permitido.'
  if (/(href|src)\s*=\s*["']\s*(https?:|\/\/)/i.test(t)) return 'SVG com referências externas não é permitido.'
  return null
}

/** Valida extensão, tamanho e assinatura (magic bytes) do arquivo. */
export function validarArquivoLogotipo(nome: string, bytes: Uint8Array): ResultadoLogo {
  const ext = (nome.split('.').pop() ?? '').toLowerCase()
  if (!['png', 'svg', 'jpg', 'jpeg'].includes(ext)) return { ok: false, erro: 'Formato não permitido. Envie PNG, SVG ou JPG.' }
  if (bytes.length === 0) return { ok: false, erro: 'Arquivo vazio.' }
  if (bytes.length > TAMANHO_MAXIMO_LOGO) return { ok: false, erro: 'Arquivo acima de 2 MB.' }
  if (ext === 'png') return comeca(bytes, PNG) ? { ok: true, mime: 'image/png' } : { ok: false, erro: 'O conteúdo não corresponde a um PNG.' }
  if (ext === 'jpg' || ext === 'jpeg') return comeca(bytes, JPG) ? { ok: true, mime: 'image/jpeg' } : { ok: false, erro: 'O conteúdo não corresponde a um JPG.' }
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, erro: 'SVG com codificação inválida (use UTF-8).' }
  }
  const p = problemaSvg(texto)
  return p ? { ok: false, erro: p } : { ok: true, mime: 'image/svg+xml' }
}

export interface ValorLogotipo {
  arquivo_id: string | null
  enviado_por: string | null
  enviado_em: string | null
  aprovado: boolean
}
