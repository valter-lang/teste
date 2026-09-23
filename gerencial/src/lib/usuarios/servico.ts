import 'server-only'
import { randomInt } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { q, q1, tx, type Db } from '@/lib/db'
import { hashSenha, validarPoliticaSenha } from '@/lib/auth/senha'
import type { AreaCodigo, Papel } from '@/lib/auth/permissoes'
import { ErroNegocio, mensagemAmigavel } from '@/lib/cadastros/erros'

export const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: 'ADMIN', rotulo: 'Administrador' },
  { valor: 'LANCADOR', rotulo: 'Lançador' },
  { valor: 'GESTOR', rotulo: 'Gestor' },
  { valor: 'DIRETORIA', rotulo: 'Diretoria' },
  { valor: 'AUDITOR', rotulo: 'Auditor' },
]
const AREAS_VALIDAS: AreaCodigo[] = ['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI']

const UNICOS = { usuario_email_uk: 'Já existe um usuário com este e-mail.', usuario_papel_uk: 'Este usuário já possui esta atribuição (mesmo perfil, área e unidade).' }

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string; erros?: Record<string, string> }

/* ------------------------------------------------------------------ */
/* Senha temporária                                                    */
/* ------------------------------------------------------------------ */

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' // sem I, O, l
const DIGITOS = '23456789' // sem 0 e 1

/** Gera senha temporária aleatória (criptográfica), com letras e números, que atende à política. */
export function gerarSenhaTemporaria(tamanho = 14): string {
  const todos = LETRAS + DIGITOS
  for (;;) {
    let s = ''
    for (let i = 0; i < tamanho; i++) s += todos[randomInt(todos.length)]
    if (validarPoliticaSenha(s) === null) return s
  }
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

export const esquemaUsuario = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo (mínimo 3 caracteres).').max(120, 'Nome muito longo.'),
  email: z.string().trim().toLowerCase().max(200, 'E-mail muito longo.').email('E-mail inválido.'),
})

export const esquemaAtribuicao = z.object({
  papel: z.enum(['ADMIN', 'LANCADOR', 'GESTOR', 'DIRETORIA', 'AUDITOR'], { message: 'Perfil inválido.' }),
  area: z.string().trim().transform((s) => (s === '' || s === '*' ? null : s))
    .refine((s) => s === null || (AREAS_VALIDAS as string[]).includes(s), 'Área inválida.'),
  unidadeId: z.string().trim().transform((s) => (s === '' || s === '*' ? null : Number(s)))
    .refine((n) => n === null || (Number.isInteger(n) && n > 0), 'Unidade inválida.'),
})

function errosZod(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of e.issues) {
    const k = String(i.path[0] ?? '_')
    out[k] ??= i.message
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Consultas (nunca retornam senha_hash)                               */
/* ------------------------------------------------------------------ */

export interface UsuarioResumo {
  id: string; nome: string; email: string; ativo: boolean; deve_trocar_senha: boolean
  tentativas_falhas: number; bloqueado_ate: string | null; ultimo_login_em: string | null; criado_em: string
  papeis: string | null
}

export async function listarUsuarios(f: { busca?: string; pagina?: number; porPagina?: number; status?: 'ativos' | 'inativos' | 'todos' } = {}, db?: Db) {
  const porPagina = f.porPagina ?? 20
  const pagina = Math.max(1, f.pagina ?? 1)
  const params: unknown[] = []
  const where: string[] = []
  if (f.status === 'ativos') where.push('u.ativo')
  if (f.status === 'inativos') where.push('not u.ativo')
  if (f.busca) {
    params.push(`%${f.busca.replace(/[\\%_]/g, (m) => '\\' + m)}%`)
    where.push(`(u.nome ilike $${params.length} or u.email ilike $${params.length})`)
  }
  const w = where.length ? 'where ' + where.join(' and ') : ''
  const total = await q1<{ n: number }>(`select count(*)::int n from usuario u ${w}`, params, db)
  const linhas = await q<UsuarioResumo>(
    `select u.id, u.nome, u.email, u.ativo, u.deve_trocar_senha, u.tentativas_falhas, u.bloqueado_ate, u.ultimo_login_em, u.criado_em,
            (select string_agg(distinct p.papel, ', ') from usuario_papel p where p.usuario_id = u.id) as papeis
       from usuario u ${w} order by u.ativo desc, u.nome limit ${porPagina} offset ${(pagina - 1) * porPagina}`,
    params, db)
  return { linhas, total: total?.n ?? 0, pagina, porPagina }
}

export async function obterUsuario(id: string, db?: Db) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const u = await q1<Omit<UsuarioResumo, 'papeis'>>(
    `select id, nome, email, ativo, deve_trocar_senha, tentativas_falhas, bloqueado_ate, ultimo_login_em, criado_em
       from usuario where id = $1`, [id], db)
  if (!u) return null
  const atribuicoes = await q<{ id: number; papel: Papel; area_codigo: string | null; unidade_id: number | null; unidade_nome: string | null; criado_em: string }>(
    `select p.id, p.papel, p.area_codigo, p.unidade_id, un.nome as unidade_nome, p.criado_em
       from usuario_papel p left join unidade un on un.id = p.unidade_id
      where p.usuario_id = $1 order by p.papel, p.area_codigo nulls first`, [id], db)
  return { ...u, atribuicoes }
}

/* ------------------------------------------------------------------ */
/* Regra: sempre deve restar ao menos um ADMIN ativo (global)          */
/* ------------------------------------------------------------------ */

/** ADMIN efetivo = usuário ativo com papel ADMIN sem restrição de área (ações globais exigem área nula). */
export async function contarAdminsAtivos(db: Db, exceto?: { usuarioId?: string; papelId?: number }) {
  const r = await q1<{ n: number }>(
    `select count(distinct u.id)::int n from usuario u join usuario_papel p on p.usuario_id = u.id
      where u.ativo and p.papel = 'ADMIN' and p.area_codigo is null
        and ($1::uuid is null or u.id <> $1::uuid) and ($2::int is null or p.id <> $2::int)`,
    [exceto?.usuarioId ?? null, exceto?.papelId ?? null], db)
  return r?.n ?? 0
}

/** Serializa operações que podem remover administradores (evita corrida entre duas remoções simultâneas). */
async function travarAdmins(db: PoolClient) {
  await db.query(`select pg_advisory_xact_lock(hashtext('usuario.ultimo_admin'))`)
}

const MSG_ULTIMO_ADMIN = 'Operação bloqueada: o sistema precisa manter pelo menos um administrador ativo.'

async function registrarEvento(db: PoolClient, tipo: string, atorId: string, alvoId: string) {
  // Somente identificadores: nenhum dado pessoal (nome/e-mail) é registrado no evento.
  await db.query(`insert into evento_sistema (tipo, usuario_id, detalhes) values ($1, $2, $3)`, [tipo, atorId, { usuario_alvo: alvoId }])
}

/* ------------------------------------------------------------------ */
/* Mutações                                                            */
/* ------------------------------------------------------------------ */

export async function criarUsuario(entrada: { nome: unknown; email: unknown }, atorId: string): Promise<Resultado<{ id: string; senhaTemporaria: string }>> {
  const v = esquemaUsuario.safeParse(entrada)
  if (!v.success) return { ok: false, erro: 'Revise os campos destacados.', erros: errosZod(v.error) }
  const senhaTemporaria = gerarSenhaTemporaria()
  const hash = await hashSenha(senhaTemporaria)
  try {
    const id = await tx({ usuarioId: atorId }, async (db) => {
      const r = await q1<{ id: string }>(
        `insert into usuario (nome, email, senha_hash, deve_trocar_senha) values ($1, $2, $3, true) returning id`,
        [v.data.nome, v.data.email, hash], db)
      await registrarEvento(db, 'USUARIO_CRIADO', atorId, r!.id)
      return r!.id
    })
    return { ok: true, id, senhaTemporaria }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, UNICOS) }
  }
}

export async function atualizarUsuario(id: string, entrada: { nome: unknown; email: unknown }, atorId: string): Promise<Resultado> {
  const v = esquemaUsuario.safeParse(entrada)
  if (!v.success) return { ok: false, erro: 'Revise os campos destacados.', erros: errosZod(v.error) }
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      const r = await db.query(`update usuario set nome = $2, email = $3, atualizado_em = now() where id = $1`, [id, v.data.nome, v.data.email])
      if (!r.rowCount) throw new ErroNegocio('Usuário não encontrado.')
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, UNICOS) }
  }
}

export async function definirAtivoUsuario(id: string, ativo: boolean, atorId: string): Promise<Resultado> {
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      await travarAdmins(db)
      if (!ativo && (await contarAdminsAtivos(db, { usuarioId: id })) === 0) {
        const eAdmin = await q1(`select 1 from usuario_papel where usuario_id = $1 and papel = 'ADMIN' and area_codigo is null`, [id], db)
        if (eAdmin) throw new ErroNegocio(MSG_ULTIMO_ADMIN)
      }
      const r = await db.query(
        `update usuario set ativo = $2, atualizado_em = now()${ativo ? ', tentativas_falhas = 0, bloqueado_ate = null' : ''} where id = $1`, [id, ativo])
      if (!r.rowCount) throw new ErroNegocio('Usuário não encontrado.')
      await registrarEvento(db, ativo ? 'USUARIO_REATIVADO' : 'USUARIO_DESATIVADO', atorId, id)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, UNICOS) }
  }
}

/** Gera nova senha temporária (exibida uma única vez) e obriga a troca no próximo acesso. */
export async function redefinirSenha(id: string, atorId: string): Promise<Resultado<{ senhaTemporaria: string }>> {
  const senhaTemporaria = gerarSenhaTemporaria()
  const hash = await hashSenha(senhaTemporaria)
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      const r = await db.query(
        `update usuario set senha_hash = $2, deve_trocar_senha = true, tentativas_falhas = 0, bloqueado_ate = null, atualizado_em = now()
          where id = $1`, [id, hash])
      if (!r.rowCount) throw new ErroNegocio('Usuário não encontrado.')
      await registrarEvento(db, 'USUARIO_SENHA_REDEFINIDA', atorId, id)
    })
    return { ok: true, senhaTemporaria }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

export async function desbloquearUsuario(id: string, atorId: string): Promise<Resultado> {
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      const r = await db.query(`update usuario set tentativas_falhas = 0, bloqueado_ate = null, atualizado_em = now() where id = $1`, [id])
      if (!r.rowCount) throw new ErroNegocio('Usuário não encontrado.')
      await registrarEvento(db, 'USUARIO_DESBLOQUEADO', atorId, id)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

export async function adicionarAtribuicao(usuarioId: string, entrada: { papel: unknown; area: unknown; unidadeId: unknown }, atorId: string): Promise<Resultado> {
  const v = esquemaAtribuicao.safeParse({ papel: entrada.papel, area: String(entrada.area ?? ''), unidadeId: String(entrada.unidadeId ?? '') })
  if (!v.success) return { ok: false, erro: 'Revise os campos da atribuição.', erros: errosZod(v.error) }
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      if (v.data.unidadeId !== null) {
        const un = await q1<{ ativo: boolean }>('select ativo from unidade where id = $1', [v.data.unidadeId], db)
        if (!un?.ativo) throw new ErroNegocio('Unidade inexistente ou desativada.')
      }
      await db.query(`insert into usuario_papel (usuario_id, papel, area_codigo, unidade_id) values ($1, $2, $3, $4)`,
        [usuarioId, v.data.papel, v.data.area, v.data.unidadeId])
      await registrarEvento(db, 'USUARIO_PERFIL_ATRIBUIDO', atorId, usuarioId)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e, UNICOS) }
  }
}

export async function removerAtribuicao(papelId: number, atorId: string): Promise<Resultado> {
  try {
    await tx({ usuarioId: atorId }, async (db) => {
      await travarAdmins(db)
      const p = await q1<{ usuario_id: string; papel: string; area_codigo: string | null }>(
        'select usuario_id, papel, area_codigo from usuario_papel where id = $1', [papelId], db)
      if (!p) throw new ErroNegocio('Atribuição não encontrada.')
      if (p.papel === 'ADMIN' && p.area_codigo === null && (await contarAdminsAtivos(db, { papelId })) === 0) {
        throw new ErroNegocio(MSG_ULTIMO_ADMIN)
      }
      await db.query('delete from usuario_papel where id = $1', [papelId])
      await registrarEvento(db, 'USUARIO_PERFIL_REMOVIDO', atorId, p.usuario_id)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
