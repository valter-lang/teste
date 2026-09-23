'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { entidadePorSlug } from '@/lib/cadastros/definicoes'
import { formParaObjeto } from '@/lib/cadastros/validacao'
import { adicionarAlias, alterarAtivoCadastro, removerAlias, salvarCadastro } from '@/lib/cadastros/servico'
import { comPermissao, inteiro, texto, type EstadoAcao } from '@/lib/cadastros/acao'

/** Cria ou atualiza um cadastro (id nulo = novo). Permissão verificada no servidor. */
export async function salvarCadastroAcao(slug: string, id: number | null, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  let destino: string | null = null
  const r = await comPermissao('cadastros.editar', async (u) => {
    const def = entidadePorSlug(slug)
    if (!def) return { erro: 'Cadastro desconhecido.' }
    if (id !== null && (!Number.isInteger(id) || id <= 0)) return { erro: 'Registro inválido.' }
    const entrada = formParaObjeto(def, fd)
    const res = await salvarCadastro(def, id, entrada, u.id)
    if (!res.ok) return { erro: res.erro, erros: res.erros, valores: entrada }
    revalidatePath('/cadastros', 'layout')
    const voltar = texto(fd, '_voltar')
    destino = voltar.startsWith('/cadastros/') ? voltar : `/cadastros/${def.slug}?ok=${id === null ? 'criado' : 'salvo'}`
    return { ok: true }
  })
  if (destino) redirect(destino)
  return r
}

export async function alternarAtivoAcao(_prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  let destino: string | null = null
  const r = await comPermissao('cadastros.editar', async (u) => {
    const def = entidadePorSlug(texto(fd, 'entidade'))
    const id = inteiro(fd, 'id')
    if (!def || !id) return { erro: 'Registro inválido.' }
    const ativar = texto(fd, 'ativo') === 'true'
    const r = await alterarAtivoCadastro(def, id, ativar, u.id)
    if (!r.ok) return { erro: r.erro }
    revalidatePath('/cadastros', 'layout')
    // Na listagem o registro pode sair do filtro atual: volta à lista com a mensagem
    const voltar = texto(fd, '_voltar')
    if (voltar.startsWith(`/cadastros/${def.slug}`)) {
      destino = `${voltar}${voltar.includes('?') ? '&' : '?'}ok=${ativar ? 'reativado' : 'desativado'}`
    }
    return { ok: true, mensagem: ativar ? 'Reativado.' : 'Desativado (histórico preservado).' }
  })
  if (destino) redirect(destino)
  return r
}

export async function adicionarAliasAcao(_prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('cadastros.editar', async (u) => {
    const familiaId = inteiro(fd, 'familia_id')
    if (!familiaId) return { erro: 'Família inválida.' }
    const r = await adicionarAlias(familiaId, texto(fd, 'alias'), u.id)
    if (!r.ok) return { erro: r.erro }
    revalidatePath('/cadastros', 'layout')
    return { ok: true, mensagem: 'Sinônimo adicionado.' }
  })
}

export async function removerAliasAcao(_prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('cadastros.editar', async (u) => {
    const familiaId = inteiro(fd, 'familia_id')
    if (!familiaId) return { erro: 'Família inválida.' }
    const r = await removerAlias(familiaId, texto(fd, 'alias'), u.id)
    if (!r.ok) return { erro: r.erro }
    revalidatePath('/cadastros', 'layout')
    return { ok: true, mensagem: 'Sinônimo removido.' }
  })
}
