'use server'
import { revalidatePath } from 'next/cache'
import { exigirLogin } from '@/lib/auth/sessao'
import { AREAS, AcessoNegado, pode, type AreaCodigo } from '@/lib/auth/permissoes'
import { transicionar, ErroFechamento, type AcaoFechamento } from '@/lib/fechamento'
import { validarCompetencia } from '@/lib/competencia'
import { tx, mensagemErroDb } from '@/lib/db'

export type EstadoAcao = { erro?: string; ok?: string } | undefined

export async function executarTransicao(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const u = await exigirLogin()
  const area = String(fd.get('area')) as AreaCodigo
  const comp = String(fd.get('competencia'))
  const acao = String(fd.get('acao')) as AcaoFechamento
  if (!AREAS.some((a) => a.codigo === area) || !validarCompetencia(comp)) return { erro: 'Parâmetros inválidos.' }
  try {
    await transicionar(u, area, comp, acao, { versaoEsperada: Number(fd.get('versao')), justificativa: String(fd.get('justificativa') ?? '') })
  } catch (e) {
    if (e instanceof ErroFechamento || e instanceof AcessoNegado) return { erro: e.message }
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/fechamento')
  return { ok: 'Situação do período atualizada.' }
}

/** Declarações que distinguem "zero confirmado" de "não informado". */
export async function declarar(_: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const u = await exigirLogin()
  const area = String(fd.get('area')) as AreaCodigo
  const comp = String(fd.get('competencia'))
  const chave = String(fd.get('chave'))
  if (!['SEM_P1', 'SEM_INCIDENTE_SEGURANCA', 'SEM_TESTE_RESTAURACAO'].includes(chave) || !validarCompetencia(comp)) return { erro: 'Declaração inválida.' }
  if (!pode(u, 'periodo.enviar_validacao', area)) return { erro: 'Somente o gestor da área pode declarar.' }
  try {
    await tx({ usuarioId: u.id }, (db) => db.query(
      `insert into declaracao_periodo (competencia, area_codigo, chave, valor, observacao, declarado_por) values ($1,$2,$3,true,$4,$5)
       on conflict (competencia, area_codigo, chave) do update set valor = true, observacao = excluded.observacao, declarado_por = excluded.declarado_por, declarado_em = now()`,
      [comp, area, chave, String(fd.get('observacao') ?? '') || null, u.id]))
  } catch (e) {
    return { erro: mensagemErroDb(e) }
  }
  revalidatePath('/fechamento')
  return { ok: 'Declaração registrada.' }
}
