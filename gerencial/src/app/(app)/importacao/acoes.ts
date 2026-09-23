'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AcessoNegado, type Acao } from '@/lib/auth/permissoes'
import { mensagemErroDb } from '@/lib/db'
import { analisarERegistrar, descartarImportacao, ErroImportacao, gravarImportacao, homologarImportacao, resolverPendencia } from '@/lib/importacao/gravar'

const TAMANHO_MAXIMO = 10 * 1024 * 1024
const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04": todo .xlsx é um pacote zip

function mensagem(e: unknown): string {
  if (e instanceof ErroImportacao || e instanceof AcessoNegado) return e.message
  const pg = e as { code?: string }
  if (pg?.code) return mensagemErroDb(e)
  return e instanceof Error && /xlsx|zip|Excel|worksheet/i.test(e.message) ? 'Arquivo inválido ou corrompido: não foi possível ler a planilha.' : 'Erro inesperado ao processar a importação.'
}

const destino = (base: string, chave: 'erro' | 'ok', texto: string) => `${base}?${chave}=${encodeURIComponent(texto)}`

/** Executa a operação protegida e devolve a URL de retorno (redirect fica fora do try). */
async function executar(acao: Acao, base: string, fn: (usuarioId: string) => Promise<string>): Promise<never> {
  const u = await exigirPermissao(acao)
  let url: string
  try {
    url = destino(base, 'ok', await fn(u.id))
  } catch (e) {
    url = destino(base, 'erro', mensagem(e))
  }
  revalidatePath('/importacao')
  redirect(url)
}

const idDe = (fd: FormData) => {
  const n = Number(fd.get('id'))
  if (!Number.isInteger(n) || n <= 0) throw new ErroImportacao('Importação inválida.')
  return n
}

export async function enviarPlanilha(fd: FormData) {
  const u = await exigirPermissao('importacao.executar')
  const arquivo = fd.get('arquivo')
  let url: string
  try {
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroImportacao('Selecione a planilha (.xlsx).')
    if (!/\.xlsx$/i.test(arquivo.name)) throw new ErroImportacao('Somente arquivos .xlsx são aceitos.')
    if (arquivo.size > TAMANHO_MAXIMO) throw new ErroImportacao('Arquivo maior que 10 MB.')
    const buffer = Buffer.from(await arquivo.arrayBuffer())
    if (!ASSINATURA_ZIP.every((b, i) => buffer[i] === b)) throw new ErroImportacao('O conteúdo não é uma planilha .xlsx válida.')
    const nome = arquivo.name.replace(/[^\w.\- ()À-ÿ]/g, '_').slice(0, 200)
    const { importacaoId } = await analisarERegistrar(buffer, nome, u.id)
    url = destino(`/importacao/${importacaoId}`, 'ok', 'Planilha analisada. Revise as propostas, pendências e totais antes de gravar.')
  } catch (e) {
    url = destino('/importacao', 'erro', mensagem(e))
  }
  revalidatePath('/importacao')
  redirect(url)
}

export async function gravar(fd: FormData) {
  const id = Number(fd.get('id'))
  return executar('importacao.executar', `/importacao/${id}`, async (usuarioId) => {
    const aceitas = fd.getAll('proposta').map(String)
    const r = await gravarImportacao(idDe(fd), usuarioId, { aceitarPropostas: false, propostasAceitas: aceitas })
    const div = r.reconciliacao.filter((x) => !x.confere).length
    return `Importação gravada. Reconciliação: ${r.reconciliacao.length - div} de ${r.reconciliacao.length} verificações conferem${div ? `, ${div} divergência(s)` : ''}.`
  })
}

export async function descartar(fd: FormData) {
  const id = Number(fd.get('id'))
  return executar('importacao.executar', `/importacao/${id}`, async (usuarioId) => {
    const r = await descartarImportacao(idDe(fd), usuarioId, String(fd.get('motivo') ?? '').trim() || undefined)
    const total = Object.values(r.removidos).reduce((s, n) => s + n, 0)
    return `Importação descartada. ${total} registro(s) removido(s).`
  })
}

export async function homologar(fd: FormData) {
  const id = Number(fd.get('id'))
  return executar('importacao.homologar', `/importacao/${id}`, async (usuarioId) => {
    await homologarImportacao(idDe(fd), usuarioId, String(fd.get('observacao') ?? ''))
    return 'Importação homologada.'
  })
}

export async function resolver(fd: FormData) {
  const id = Number(fd.get('id'))
  return executar('importacao.executar', `/importacao/${id}`, async (usuarioId) => {
    const pid = Number(fd.get('pendencia'))
    if (!Number.isInteger(pid) || pid <= 0) throw new ErroImportacao('Pendência inválida.')
    await resolverPendencia(pid, usuarioId, String(fd.get('resolucao') ?? ''), idDe(fd))
    return 'Pendência resolvida.'
  })
}
