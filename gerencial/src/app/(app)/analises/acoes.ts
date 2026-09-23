'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { tx, mensagemErroDb } from '@/lib/db'

export type Estado = { erro?: string; ok?: string } | undefined

const Esquema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}-01$/),
  area_codigo: z.enum(['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI']),
  tipo: z.enum(['DESTAQUE', 'ATENCAO', 'RISCO', 'DEPENDENCIA', 'EXPLICACAO_DESVIO', 'DECISAO_SOLICITADA']),
  fato: z.string().trim().min(10, 'Descreva o fato (mín. 10 caracteres).').max(1000),
  numero: z.string().trim().max(60).transform((v) => v || null),
  indicador_codigo: z.string().trim().max(60).transform((v) => v || null),
  ocorrencia: z.string().trim().max(300).transform((v) => v || null),
  responsavel: z.string().trim().min(3, 'Informe o responsável.').max(120),
  area_dependente: z.string().trim().transform((v) => v || null),
}).superRefine((v, ctx) => {
  if (v.tipo === 'DESTAQUE' && !v.numero) ctx.addIssue({ code: 'custom', message: 'Destaque exige fato, número e responsável.' })
  if (v.tipo === 'ATENCAO' && !v.indicador_codigo && !v.ocorrencia) ctx.addIssue({ code: 'custom', message: 'Ponto de atenção deve estar ligado a um indicador ou ocorrência real.' })
  if (v.tipo === 'EXPLICACAO_DESVIO' && !v.indicador_codigo) ctx.addIssue({ code: 'custom', message: 'Explicação de desvio exige o indicador.' })
  if (v.tipo === 'DEPENDENCIA' && !v.area_dependente) ctx.addIssue({ code: 'custom', message: 'Informe a área da qual depende.' })
})

export async function salvarAnalise(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirLogin()
  const p = Esquema.safeParse(Object.fromEntries(['competencia', 'area_codigo', 'tipo', 'fato', 'numero', 'indicador_codigo', 'ocorrencia', 'responsavel', 'area_dependente'].map((k) => [k, String(fd.get(k) ?? '')])))
  if (!p.success) return { erro: p.error.issues[0].message }
  if (!pode(u, 'analise.editar', p.data.area_codigo)) return { erro: 'Seu perfil não pode registrar análises desta área.' }
  const d = p.data
  try {
    await tx({ usuarioId: u.id }, (db) => db.query(
      `insert into analise_item (competencia, area_codigo, tipo, fato, numero, indicador_codigo, ocorrencia, responsavel, area_dependente, criado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.competencia, d.area_codigo, d.tipo, d.fato, d.numero, d.indicador_codigo, d.ocorrencia, d.responsavel, d.area_dependente, u.id]))
  } catch (e) {
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/analises')
  return { ok: 'Registrado.' }
}

export async function removerAnalise(fd: FormData) {
  const u = await exigirLogin()
  const id = Number(fd.get('id'))
  const area = String(fd.get('area'))
  if (!pode(u, 'analise.editar', area)) return
  await tx({ usuarioId: u.id }, (db) => db.query(`update analise_item set excluido_em = now(), versao = versao + 1 where id = $1 and area_codigo = $2`, [id, area])).catch(() => {})
  revalidatePath('/analises')
}

export async function comentar(_: Estado, fd: FormData): Promise<Estado> {
  const u = await exigirLogin()
  const texto = String(fd.get('texto') ?? '').trim()
  const comp = String(fd.get('competencia'))
  const area = String(fd.get('area_codigo') || '') || null
  if (!pode(u, 'painel.comentar')) return { erro: 'Seu perfil não pode comentar.' }
  if (texto.length < 3 || !/^\d{4}-\d{2}-01$/.test(comp)) return { erro: 'Comentário inválido.' }
  await tx({ usuarioId: u.id }, (db) => db.query(`insert into comentario_diretoria (competencia, area_codigo, indicador_codigo, texto, usuario_id) values ($1,$2,$3,$4,$5)`,
    [comp, area, String(fd.get('indicador_codigo') || '') || null, texto.slice(0, 2000), u.id]))
  revalidatePath('/analises')
  return { ok: 'Comentário registrado.' }
}
