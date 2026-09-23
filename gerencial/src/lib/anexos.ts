import 'server-only'
import { createHash } from 'node:crypto'
import { pool, q, type Db } from '@/lib/db'

/**
 * Anexos/evidências de lançamentos: arquivo (categoria ANEXO) + anexo(entidade, entidade_id).
 * O download passa pela rota /api/arquivos/[id], que confere a permissão.
 */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024

const TIPOS: Record<string, { mime: string; confere: (b: Uint8Array) => boolean }> = {
  pdf: { mime: 'application/pdf', confere: (b) => inicia(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  png: { mime: 'image/png', confere: (b) => inicia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: 'image/jpeg', confere: (b) => inicia(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', confere: (b) => inicia(b, [0xff, 0xd8, 0xff]) },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', confere: (b) => inicia(b, [0x50, 0x4b, 0x03, 0x04]) },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', confere: (b) => inicia(b, [0x50, 0x4b, 0x03, 0x04]) },
  csv: { mime: 'text/csv; charset=utf-8', confere: ehTexto },
  txt: { mime: 'text/plain; charset=utf-8', confere: ehTexto },
}
export const EXTENSOES_ANEXO = Object.keys(TIPOS)

function inicia(b: Uint8Array, assinatura: number[]) {
  return b.length >= assinatura.length && assinatura.every((x, i) => b[i] === x)
}

/** Texto (UTF-8 ou Latin-1): sem bytes nulos nem caracteres de controle binários. */
function ehTexto(b: Uint8Array): boolean {
  for (const x of b.subarray(0, 64 * 1024)) if (x === 0 || x < 0x09 || (x > 0x0d && x < 0x20 && x !== 0x1b)) return false
  return true
}

/** Nome seguro: sem caminho, sem caracteres de controle ou reservados, até 120 caracteres. */
export function sanitizarNome(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? 'arquivo'
  const limpo = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*;]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  const partes = limpo.split('.')
  const ext = partes.length > 1 ? partes.pop()!.toLowerCase().slice(0, 10) : ''
  const corpo = partes.join('.').slice(0, 110) || 'arquivo'
  return ext ? `${corpo}.${ext}` : corpo
}

export class ErroAnexo extends Error {}

export interface ArquivoRecebido {
  nome: string
  bytes: Uint8Array
}

/** Confere tamanho, extensão e assinatura (magic bytes). Lança ErroAnexo. */
export function validarArquivo(a: ArquivoRecebido): { nome: string; mime: string; sha256: string } {
  if (!a.bytes.length) throw new ErroAnexo('Arquivo vazio.')
  if (a.bytes.length > TAMANHO_MAXIMO_ANEXO) throw new ErroAnexo('Arquivo maior que 10 MB.')
  const nome = sanitizarNome(a.nome)
  const ext = nome.includes('.') ? nome.split('.').pop()! : ''
  const tipo = TIPOS[ext]
  if (!tipo) throw new ErroAnexo(`Tipo de arquivo não permitido. Aceitos: ${EXTENSOES_ANEXO.join(', ')}.`)
  if (!tipo.confere(a.bytes)) throw new ErroAnexo('O conteúdo do arquivo não corresponde à extensão informada.')
  return { nome, mime: tipo.mime, sha256: createHash('sha256').update(a.bytes).digest('hex') }
}

export async function salvarAnexo(
  db: Db,
  p: { entidade: string; entidadeId: number | string; arquivo: ArquivoRecebido; descricao?: string | null; usuarioId: string },
): Promise<{ anexoId: number; arquivoId: string }> {
  const v = validarArquivo(p.arquivo)
  const arq = await db.query<{ id: string }>(
    `insert into arquivo (nome, mime, tamanho, sha256, conteudo, categoria, criado_por)
     values ($1, $2, $3, $4, $5, 'ANEXO', $6) returning id`,
    [v.nome, v.mime, p.arquivo.bytes.length, v.sha256, Buffer.from(p.arquivo.bytes), p.usuarioId],
  )
  const an = await db.query<{ id: number }>(
    `insert into anexo (entidade, entidade_id, arquivo_id, descricao, criado_por) values ($1, $2, $3, $4, $5) returning id`,
    [p.entidade, String(p.entidadeId), arq.rows[0].id, p.descricao?.trim().slice(0, 300) || null, p.usuarioId],
  )
  return { anexoId: an.rows[0].id, arquivoId: arq.rows[0].id }
}

export interface AnexoListado {
  id: number
  arquivo_id: string
  nome: string
  mime: string
  tamanho: number
  sha256: string
  descricao: string | null
  criado_em: Date
  criado_por_nome: string | null
}

export async function listarAnexos(entidade: string, entidadeId: number | string, db: Db = pool()): Promise<AnexoListado[]> {
  return q<AnexoListado>(
    `select a.id, a.arquivo_id, f.nome, f.mime, f.tamanho, f.sha256, a.descricao, a.criado_em, u.nome as criado_por_nome
       from anexo a join arquivo f on f.id = a.arquivo_id left join usuario u on u.id = a.criado_por
      where a.entidade = $1 and a.entidade_id = $2 and a.excluido_em is null
      order by a.criado_em desc`,
    [entidade, String(entidadeId)], db,
  )
}

/** Exclusão lógica do vínculo (o arquivo permanece para a trilha de auditoria). */
export async function excluirAnexo(db: Db, entidade: string, entidadeId: number | string, anexoId: number): Promise<boolean> {
  const r = await db.query(
    `update anexo set excluido_em = now() where id = $1 and entidade = $2 and entidade_id = $3 and excluido_em is null`,
    [anexoId, entidade, String(entidadeId)],
  )
  return (r.rowCount ?? 0) > 0
}
