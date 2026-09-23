import 'server-only'
import { q, q1, type Db } from '@/lib/db'
export { diferencasAuditoria, mascararDadosPessoais, type Diferenca } from './auditoria-diff'

export interface FiltrosAuditoria {
  tabela?: string
  de?: string // YYYY-MM-DD
  ate?: string // YYYY-MM-DD
  usuarioId?: string
  operacao?: string
  registroId?: string
  pagina?: number
  porPagina?: number
}

const dataOk = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const uuidOk = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s)

export async function listarAuditoria(f: FiltrosAuditoria, db?: Db) {
  const porPagina = f.porPagina ?? 25
  const pagina = Math.max(1, f.pagina ?? 1)
  const p: unknown[] = []
  const w: string[] = []
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)) }
  if (f.tabela) add('a.tabela = ?', f.tabela)
  if (dataOk(f.de)) add(`a.em >= (?::date)::timestamp at time zone 'America/Sao_Paulo'`, f.de)
  if (dataOk(f.ate)) add(`a.em < ((?::date) + 1)::timestamp at time zone 'America/Sao_Paulo'`, f.ate)
  if (f.usuarioId === 'sistema') w.push('a.usuario_id is null')
  else if (uuidOk(f.usuarioId)) add('a.usuario_id = ?::uuid', f.usuarioId)
  if (f.operacao && ['INSERT', 'UPDATE', 'DELETE'].includes(f.operacao)) add('a.operacao = ?', f.operacao)
  if (f.registroId) add('a.registro_id = ?', f.registroId)
  const where = w.length ? 'where ' + w.join(' and ') : ''
  const total = await q1<{ n: number }>(`select count(*)::int n from auditoria a ${where}`, p, db)
  const linhas = await q<{ id: number; tabela: string; registro_id: string | null; operacao: string; em: string; usuario_nome: string | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; contexto: Record<string, unknown> | null }>(
    `select a.id, a.tabela, a.registro_id, a.operacao, a.em, u.nome as usuario_nome, a.antes, a.depois, a.contexto
       from auditoria a left join usuario u on u.id = a.usuario_id ${where}
      order by a.em desc, a.id desc limit ${porPagina} offset ${(pagina - 1) * porPagina}`, p, db)
  return { linhas, total: total?.n ?? 0, pagina, porPagina }
}

export async function tabelasAuditadas(db?: Db) {
  const r = await q<{ tabela: string }>(
    `select c.relname as tabela from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid
      where f.proname = 'trg_auditoria' and not t.tgisinternal group by c.relname order by c.relname`, [], db)
  return r.map((x) => x.tabela)
}

export async function usuariosParaFiltro(db?: Db) {
  return q<{ id: string; nome: string }>('select id, nome from usuario order by nome', [], db)
}

export async function listarEventosSistema(f: { tipo?: string; de?: string; ate?: string; usuarioId?: string; pagina?: number; porPagina?: number }, db?: Db) {
  const porPagina = f.porPagina ?? 25
  const pagina = Math.max(1, f.pagina ?? 1)
  const p: unknown[] = []
  const w: string[] = []
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)) }
  if (f.tipo) add('e.tipo = ?', f.tipo)
  if (dataOk(f.de)) add(`e.em >= (?::date)::timestamp at time zone 'America/Sao_Paulo'`, f.de)
  if (dataOk(f.ate)) add(`e.em < ((?::date) + 1)::timestamp at time zone 'America/Sao_Paulo'`, f.ate)
  if (uuidOk(f.usuarioId)) add('e.usuario_id = ?::uuid', f.usuarioId)
  const where = w.length ? 'where ' + w.join(' and ') : ''
  const total = await q1<{ n: number }>(`select count(*)::int n from evento_sistema e ${where}`, p, db)
  const linhas = await q<{ id: number; tipo: string; em: string; usuario_nome: string | null; alvo_nome: string | null; detalhes: Record<string, unknown> | null }>(
    `select e.id, e.tipo, e.em, u.nome as usuario_nome, e.detalhes,
            (select a.nome from usuario a where a.id::text = e.detalhes->>'usuario_alvo') as alvo_nome
       from evento_sistema e left join usuario u on u.id = e.usuario_id ${where}
      order by e.em desc, e.id desc limit ${porPagina} offset ${(pagina - 1) * porPagina}`, p, db)
  const tipos = await q<{ tipo: string }>('select distinct tipo from evento_sistema order by tipo', [], db)
  return { linhas, total: total?.n ?? 0, pagina, porPagina, tipos: tipos.map((t) => t.tipo) }
}
