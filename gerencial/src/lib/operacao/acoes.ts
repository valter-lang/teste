'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { usuarioAtual } from '@/lib/auth/sessao'
import { pode, type UsuarioSessao } from '@/lib/auth/permissoes'
import { mensagemErroDb, q1, tx } from '@/lib/db'
import { validarCompetencia } from '@/lib/competencia'
import { ErroAnexo, excluirAnexo, salvarAnexo } from '@/lib/anexos'
import type { Entrada } from '@/lib/validacao/comum'
import { camposEditaveis, ehEntidade, entidade, urlLista, urlRegistro, type EntidadeDef } from './entidades'
import { atualizarRegistro, criarRegistro, excluirRegistro, importarLinhas, obterRegistro, registroParaEntrada } from './crud'
import { periodoBloqueado, statusPeriodo } from './periodo'
import { excluirTentativa, registrarTentativa } from './comodato'
import { preencherJanelasPeloExpediente } from './ti'
import type { EstadoForm, ResultadoColagem, ResultadoLinha } from './tipos'

/**
 * Server actions genéricas dos lançamentos. Toda ação reconfere a permissão no servidor
 * pela área da entidade (nunca por campo oculto) e grava com o usuário na transação.
 */
const NEGADO = 'Acesso negado para o seu perfil.'

async function autorizar(chave: string): Promise<{ u: UsuarioSessao; def: EntidadeDef } | null> {
  if (!ehEntidade(chave)) return null
  const def = entidade(chave)
  const u = await usuarioAtual()
  if (!u || !pode(u, 'dados.editar', def.area)) return null
  return { u, def }
}

const idValido = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0

/** Somente os campos conhecidos da entidade (+ peças e restritos quando permitidos). */
function entradaDoForm(def: EntidadeDef, fd: FormData, podeRestritos: boolean): Entrada {
  const e: Entrada = {}
  for (const c of camposEditaveis(def, podeRestritos)) {
    const v = fd.get(c.nome)
    if (typeof v === 'string') e[c.nome] = v
  }
  if (def.pecas && typeof fd.get('pecas') === 'string') e.pecas = String(fd.get('pecas'))
  return e
}

function filtrarEntrada(def: EntidadeDef, valores: Record<string, unknown>, podeRestritos: boolean): Entrada {
  const e: Entrada = {}
  for (const c of camposEditaveis(def, podeRestritos)) {
    const v = valores?.[c.nome]
    if (typeof v === 'string') e[c.nome] = v
  }
  return e
}

const revalidar = (def: EntidadeDef) => revalidatePath(def.rota, 'layout')

export async function acaoSalvar(chave: string, id: number | null, _prev: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(chave)
  if (!a) return { erro: NEGADO, seq: Date.now() }
  const { u, def } = a
  const podeRestritos = pode(u, 'dados.restritos.ler', def.area)
  const entrada = entradaDoForm(def, fd, podeRestritos)
  if (id === null) {
    const r = await criarRegistro(def, entrada, { usuarioId: u.id, podeRestritos })
    if (!r.ok) return { erro: r.erro, erros: r.erros, valores: entrada, seq: Date.now() }
    revalidar(def)
    redirect(`${urlRegistro(def)}/${r.id}?salvo=1`)
  }
  if (!idValido(id)) return { erro: 'Registro inválido.', seq: Date.now() }
  const versao = fd.get('versao') ? Number(fd.get('versao')) : null
  const r = await atualizarRegistro(def, id, versao, entrada, { usuarioId: u.id, podeRestritos })
  if (!r.ok) return { erro: r.erro, erros: r.erros, valores: entrada, versao, seq: Date.now() }
  revalidar(def)
  const atual = await obterRegistro(def, id, { podeRestritos })
  return { ok: 'Alterações salvas.', valores: atual ? registroParaEntrada(def, atual) : entrada, versao: r.versao, seq: Date.now() }
}

export async function acaoExcluir(chave: string, id: number, _prev: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(chave)
  if (!a) return { erro: NEGADO }
  if (!idValido(id)) return { erro: 'Registro inválido.' }
  const versao = fd.get('versao') ? Number(fd.get('versao')) : null
  const r = await excluirRegistro(a.def, id, versao, String(fd.get('motivo') ?? ''), { usuarioId: a.u.id })
  if (!r.ok) return { erro: r.erro, erros: r.erros }
  revalidar(a.def)
  redirect(`${urlLista(a.def)}${urlLista(a.def).includes('?') ? '&' : '?'}excluido=1`)
}

/** Grade: grava uma linha (inclusão quando id = null). */
export async function acaoSalvarLinha(chave: string, id: number | null, versao: number | null, valores: Record<string, string>): Promise<ResultadoLinha> {
  const a = await autorizar(chave)
  if (!a) return { ok: false, erro: NEGADO }
  const { u, def } = a
  const entrada = filtrarEntrada(def, valores, false)
  const r = id === null
    ? await criarRegistro(def, { ...def.padroes, ...entrada }, { usuarioId: u.id }, 'grade')
    : idValido(id) ? await atualizarRegistro(def, id, versao, entrada, { usuarioId: u.id }, 'grade') : { ok: false, erro: 'Registro inválido.' }
  if (!r.ok) return r
  revalidar(def)
  const atual = await obterRegistro(def, r.id!)
  return { ...r, valores: atual ? registroParaEntrada(def, atual) : entrada }
}

/** "Colar linhas": colunas mapeadas para campos; linhas numeradas a partir de 2 (linha 1 = cabeçalho). */
export async function acaoColar(chave: string, competenciaPadrao: string, colunas: string[], linhas: string[][], primeiraLinha = 2): Promise<ResultadoColagem> {
  const a = await autorizar(chave)
  if (!a) return { gravadas: 0, ids: [], erros: [], erroGeral: NEGADO }
  const { u, def } = a
  if (!Array.isArray(colunas) || !Array.isArray(linhas)) return { gravadas: 0, ids: [], erros: [], erroGeral: 'Dados inválidos.' }
  const validos = new Set(camposEditaveis(def, false).map((c) => c.nome))
  const mapa = colunas.map((c) => (typeof c === 'string' && validos.has(c) ? c : null))
  if (!mapa.some(Boolean)) return { gravadas: 0, ids: [], erros: [], erroGeral: 'Nenhuma coluna foi associada a um campo.' }
  const padrao = validarCompetencia(competenciaPadrao) ? competenciaPadrao : ''
  const itens = linhas.slice(0, 2000).map((cel, i) => {
    const e: Entrada = { ...def.padroes }
    mapa.forEach((campo, j) => {
      if (campo) e[campo] = typeof cel?.[j] === 'string' ? cel[j] : ''
    })
    if (!def.competenciaDerivada && !e.competencia && padrao) e.competencia = padrao
    return { linha: i + primeiraLinha, entrada: e }
  })
  const r = await importarLinhas(def, itens, { usuarioId: u.id })
  if (r.gravadas) revalidar(def)
  return r
}

/* ------------------------------------------------------------------ */
/* Anexos                                                              */
/* ------------------------------------------------------------------ */

async function autorizarAnexo(chave: string, id: number) {
  const a = await autorizar(chave)
  if (!a || !a.def.anexos) return { erro: NEGADO }
  if (!idValido(id)) return { erro: 'Registro inválido.' }
  const reg = await q1<{ competencia?: string; excluido_em: Date | null }>(`select competencia, excluido_em from ${a.def.tabela} where id = $1`, [id])
  if (!reg || reg.excluido_em) return { erro: 'Registro não encontrado ou excluído.' }
  if (periodoBloqueado(await statusPeriodo(a.def.area, reg.competencia))) return { erro: 'Período aprovado/fechado: reabra o período para alterar evidências.' }
  return a
}

export async function acaoEnviarAnexo(chave: string, id: number, _prev: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarAnexo(chave, id)
  if ('erro' in a) return { erro: a.erro }
  const arq = fd.get('arquivo')
  if (!(arq instanceof File) || !arq.size) return { erro: 'Selecione um arquivo.', erros: { arquivo: 'Selecione um arquivo.' } }
  try {
    const bytes = new Uint8Array(await arq.arrayBuffer())
    await tx({ usuarioId: a.u.id }, (db) =>
      salvarAnexo(db, { entidade: a.def.tabela, entidadeId: id, arquivo: { nome: arq.name, bytes }, descricao: String(fd.get('descricao') ?? ''), usuarioId: a.u.id }))
  } catch (e) {
    const msg = e instanceof ErroAnexo ? e.message : mensagemErroDb(e)
    return { erro: msg, erros: { arquivo: msg } }
  }
  revalidar(a.def)
  return { ok: 'Anexo enviado.', seq: Date.now() }
}

export async function acaoExcluirAnexo(chave: string, id: number, anexoId: number, _prev: EstadoForm | undefined, _fd: FormData): Promise<EstadoForm> {
  const a = await autorizarAnexo(chave, id)
  if ('erro' in a) return { erro: a.erro }
  if (!idValido(anexoId)) return { erro: 'Anexo inválido.' }
  const ok = await tx({ usuarioId: a.u.id }, (db) => excluirAnexo(db, a.def.tabela, id, anexoId))
  if (!ok) return { erro: 'Anexo não encontrado.' }
  revalidar(a.def)
  return { ok: 'Anexo removido.' }
}

/* ------------------------------------------------------------------ */
/* Específicas                                                         */
/* ------------------------------------------------------------------ */

export async function acaoTentativa(movimentoId: number, _prev: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar('comodato_movimento')
  if (!a) return { erro: NEGADO }
  if (!idValido(movimentoId)) return { erro: 'Movimento inválido.' }
  const entrada: Entrada = {}
  for (const k of ['data', 'sucesso', 'motivo_insucesso', 'marcar_sem_exito']) entrada[k] = String(fd.get(k) ?? '')
  const r = await registrarTentativa(movimentoId, entrada, a.u.id)
  if (!r.ok) return { erro: r.erro, erros: r.erros, valores: entrada, seq: Date.now() }
  revalidar(a.def)
  return { ok: 'Tentativa registrada.', seq: Date.now() }
}

export async function acaoExcluirTentativa(movimentoId: number, tentativaId: number, _prev: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar('comodato_movimento')
  if (!a) return { erro: NEGADO }
  if (!idValido(movimentoId) || !idValido(tentativaId)) return { erro: 'Registro inválido.' }
  const r = await excluirTentativa(movimentoId, tentativaId, String(fd.get('motivo') ?? ''), a.u.id)
  if (!r.ok) return { erro: r.erro }
  revalidar(a.def)
  return { ok: 'Tentativa removida.' }
}

export async function acaoJanelasExpediente(competencia: string, _prev: EstadoForm | undefined, _fd: FormData): Promise<EstadoForm> {
  const a = await autorizar('ti_janela_programada')
  if (!a) return { erro: NEGADO }
  if (!validarCompetencia(competencia)) return { erro: 'Competência inválida.' }
  const r = await preencherJanelasPeloExpediente(competencia, a.u.id)
  if (!r.ok) return { erro: r.erro }
  revalidar(a.def)
  return { ok: r.criadas ? `${r.criadas} janela(s) criada(s) pelo expediente.` : 'Todos os sistemas ativos já têm janela nesta competência.' }
}
