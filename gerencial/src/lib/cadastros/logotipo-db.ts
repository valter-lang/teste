import 'server-only'
import { createHash } from 'node:crypto'
import { q1, tx, type Db } from '@/lib/db'
import { mensagemAmigavel } from './erros'
import { validarArquivoLogotipo, type ValorLogotipo } from './logotipo'

export async function lerLogotipo(db?: Db) {
  const r = await q1<{ valor: Partial<ValorLogotipo>; enviado_por_nome: string | null; arquivo_nome: string | null; tamanho: number | null }>(
    `select c.valor, u.nome as enviado_por_nome, a.nome as arquivo_nome, a.tamanho
       from configuracao c
       left join usuario u on u.id::text = c.valor->>'enviado_por'
       left join arquivo a on a.id::text = c.valor->>'arquivo_id'
      where c.chave = 'identidade.logotipo'`, [], db)
  return r ?? null
}

/**
 * Armazena o arquivo oficial (categoria LOGOTIPO) e o referencia em configuracao 'identidade.logotipo'.
 * `aprovado` registra a declaração do administrador de que o arquivo é o oficial aprovado.
 */
export async function salvarLogotipo(nome: string, bytes: Uint8Array, aprovado: boolean, usuarioId: string):
  Promise<{ ok: true; arquivoId: string } | { ok: false; erro: string }> {
  const v = validarArquivoLogotipo(nome, bytes)
  if (!v.ok) return v
  const nomeSeguro = nome.replace(/[^\w.\- ]/g, '_').slice(0, 120)
  const sha = createHash('sha256').update(bytes).digest('hex')
  try {
    const arquivoId = await tx({ usuarioId, contexto: { acao: 'LOGOTIPO_ENVIADO' } }, async (db) => {
      const a = await q1<{ id: string }>(
        `insert into arquivo (nome, mime, tamanho, sha256, conteudo, categoria, criado_por) values ($1,$2,$3,$4,$5,'LOGOTIPO',$6) returning id`,
        [nomeSeguro, v.mime, bytes.length, sha, Buffer.from(bytes), usuarioId], db)
      const valor: ValorLogotipo = { arquivo_id: a!.id, enviado_por: usuarioId, enviado_em: new Date().toISOString(), aprovado }
      await db.query(
        `insert into configuracao (chave, valor, descricao, homologado, atualizado_em, atualizado_por)
         values ('identidade.logotipo', $1::jsonb, 'Logotipo oficial aprovado (arquivo enviado pelo administrador).', $2, now(), $3)
         on conflict (chave) do update set valor = excluded.valor, homologado = excluded.homologado, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
        [JSON.stringify(valor), aprovado, usuarioId])
      return a!.id
    })
    return { ok: true, arquivoId }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/** Deixa de usar o logotipo (o arquivo permanece armazenado para histórico). */
export async function removerLogotipo(usuarioId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const valor: ValorLogotipo = { arquivo_id: null, enviado_por: usuarioId, enviado_em: new Date().toISOString(), aprovado: false }
    await tx({ usuarioId }, (db) => db.query(
      `update configuracao set valor = $1::jsonb, homologado = false, atualizado_em = now(), atualizado_por = $2 where chave = 'identidade.logotipo'`,
      [JSON.stringify(valor), usuarioId]))
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
