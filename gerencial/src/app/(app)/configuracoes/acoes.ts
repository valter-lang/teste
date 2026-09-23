'use server'
import { revalidatePath } from 'next/cache'
import { comPermissao, inteiro, texto, type EstadoAcao } from '@/lib/cadastros/acao'
import {
  adicionarAtribuicao, atualizarUsuario, criarUsuario, definirAtivoUsuario, desbloquearUsuario, redefinirSenha, removerAtribuicao,
} from '@/lib/usuarios/servico'
import { excluirFeriado, marcarHomologado, salvarExpediente, salvarFeriado, salvarParametro } from '@/lib/cadastros/configuracao'
import { parametroPorChave } from '@/lib/cadastros/parametros'
import { removerLogotipo, salvarLogotipo } from '@/lib/cadastros/logotipo-db'
import { TAMANHO_MAXIMO_LOGO } from '@/lib/cadastros/logotipo'
import { ErroIntegracao, lerBaseInstaladaSupabase } from '@/lib/integracoes/base-instalada'
import { registrarFotografiaBaseAtiva } from '@/lib/integracoes/fotografia'
import { numero } from '@/lib/format'

const uuid = (fd: FormData, k: string) => {
  const v = texto(fd, k)
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null
}
const atualizar = () => revalidatePath('/configuracoes', 'layout')

/* ------------------------------ Usuários ------------------------------ */

export async function criarUsuarioAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const r = await criarUsuario({ nome: texto(fd, 'nome'), email: texto(fd, 'email') }, u.id)
    if (!r.ok) return { erro: r.erro, erros: r.erros }
    atualizar()
    return { ok: true, mensagem: 'Usuário criado. Atribua ao menos um perfil na página do usuário.', senhaTemporaria: r.senhaTemporaria }
  })
}

export async function atualizarUsuarioAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = uuid(fd, 'id')
    if (!id) return { erro: 'Usuário inválido.' }
    const r = await atualizarUsuario(id, { nome: texto(fd, 'nome'), email: texto(fd, 'email') }, u.id)
    if (!r.ok) return { erro: r.erro, erros: r.erros }
    atualizar()
    return { ok: true, mensagem: 'Dados salvos.' }
  })
}

export async function ativoUsuarioAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = uuid(fd, 'id')
    if (!id) return { erro: 'Usuário inválido.' }
    const ativo = texto(fd, 'ativo') === 'true'
    const r = await definirAtivoUsuario(id, ativo, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: ativo ? 'Usuário reativado.' : 'Usuário desativado.' }
  })
}

export async function redefinirSenhaAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = uuid(fd, 'id')
    if (!id) return { erro: 'Usuário inválido.' }
    const r = await redefinirSenha(id, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: 'Senha redefinida.', senhaTemporaria: r.senhaTemporaria }
  })
}

export async function desbloquearUsuarioAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = uuid(fd, 'id')
    if (!id) return { erro: 'Usuário inválido.' }
    const r = await desbloquearUsuario(id, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: 'Usuário desbloqueado.' }
  })
}

export async function adicionarAtribuicaoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = uuid(fd, 'id')
    if (!id) return { erro: 'Usuário inválido.' }
    const r = await adicionarAtribuicao(id, { papel: texto(fd, 'papel'), area: texto(fd, 'area'), unidadeId: texto(fd, 'unidade') }, u.id)
    if (!r.ok) return { erro: r.erro, erros: r.erros }
    atualizar()
    return { ok: true, mensagem: 'Perfil atribuído.' }
  })
}

export async function removerAtribuicaoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('usuarios.gerir', async (u) => {
    const id = inteiro(fd, 'papel_id')
    if (!id) return { erro: 'Atribuição inválida.' }
    const r = await removerAtribuicao(id, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: 'Perfil removido.' }
  })
}

/* ------------------------------ Calendário ------------------------------ */

export async function salvarFeriadoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const id = inteiro(fd, 'id')
    const r = await salvarFeriado(id, {
      data: texto(fd, 'data'), descricao: texto(fd, 'descricao'), abrangencia: texto(fd, 'abrangencia'),
      unidadeId: texto(fd, 'unidade'), meioPeriodo: fd.get('meio_periodo') === 'on',
    }, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: id ? 'Feriado atualizado.' : 'Feriado incluído.' }
  })
}

export async function excluirFeriadoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const id = inteiro(fd, 'id')
    if (!id) return { erro: 'Feriado inválido.' }
    const r = await excluirFeriado(id, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: 'Feriado removido.' }
  })
}

export async function salvarExpedienteAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const r = await salvarExpediente({
      fuso: texto(fd, 'fuso'), dias: fd.getAll('dias').map(String), inicio: texto(fd, 'inicio'), fim: texto(fd, 'fim'),
    }, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: 'Expediente salvo. A alteração exige nova homologação.' }
  })
}

export async function homologarConfiguracaoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const chave = texto(fd, 'chave')
    if (chave !== 'calendario.expediente' && !parametroPorChave(chave)) return { erro: 'Configuração inválida.' }
    const r = await marcarHomologado(chave, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    revalidatePath('/homologacao')
    return { ok: true, mensagem: 'Marcado como homologado.' }
  })
}

/* ------------------------------ Parâmetros ------------------------------ */

export async function salvarParametroAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const chave = texto(fd, 'chave')
    const r = await salvarParametro(chave, { valor: texto(fd, 'valor'), valores: fd.getAll('valores').map(String) }, fd.get('homologado') === 'on', u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    revalidatePath('/homologacao')
    return { ok: true, mensagem: 'Parâmetro salvo.' }
  })
}

/* --------------------------- Identidade visual --------------------------- */

export async function enviarLogotipoAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const arquivo = fd.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione o arquivo do logotipo.' }
    if (arquivo.size > TAMANHO_MAXIMO_LOGO) return { erro: 'Arquivo acima de 2 MB.' }
    if (fd.get('oficial') !== 'on') return { erro: 'Confirme que o arquivo é o logotipo oficial aprovado.' }
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    const r = await salvarLogotipo(arquivo.name, bytes, true, u.id)
    if (!r.ok) return { erro: r.erro }
    revalidatePath('/', 'layout')
    return { ok: true, mensagem: 'Logotipo oficial registrado.' }
  })
}

export async function removerLogotipoAcao(_p: EstadoAcao, _fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const r = await removerLogotipo(u.id)
    if (!r.ok) return { erro: r.erro }
    revalidatePath('/', 'layout')
    return { ok: true, mensagem: 'Logotipo removido das telas (o arquivo permanece no histórico).' }
  })
}

/* ------------------------------ Integrações ------------------------------ */

export async function registrarFotografiaAcao(_p: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  return comPermissao('configuracao.editar', async (u) => {
    const mes = texto(fd, 'competencia') // AAAA-MM
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { erro: 'Informe a competência (mês/ano).' }
    let leitura
    try {
      leitura = await lerBaseInstaladaSupabase()
    } catch (e) {
      return { erro: e instanceof ErroIntegracao ? e.message : 'Falha ao ler a base instalada.' }
    }
    const r = await registrarFotografiaBaseAtiva(`${mes}-01`, leitura, u.id)
    if (!r.ok) return { erro: r.erro }
    atualizar()
    return { ok: true, mensagem: `Fotografia registrada: ${numero(leitura.equipamentos)} equipamentos ativos, ${numero(leitura.clientes)} clientes, ${numero(leitura.lojas)} lojas.` }
  })
}
