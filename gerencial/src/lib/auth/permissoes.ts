/**
 * Matriz de permissões por perfil e área. Aplicada SEMPRE no servidor
 * (server actions, route handlers e consultas); a interface apenas reflete.
 */
export type Papel = 'ADMIN' | 'LANCADOR' | 'GESTOR' | 'DIRETORIA' | 'AUDITOR'
export type AreaCodigo = 'MANUT_INTERNA' | 'MANUT_EXTERNA' | 'ESTOQUE_PECAS' | 'COMODATO' | 'TI'

export const AREAS: { codigo: AreaCodigo; nome: string; rota: string }[] = [
  { codigo: 'MANUT_INTERNA', nome: 'Manutenção interna', rota: '/manutencao-interna' },
  { codigo: 'MANUT_EXTERNA', nome: 'Manutenção externa', rota: '/manutencao-externa' },
  { codigo: 'ESTOQUE_PECAS', nome: 'Estoque de peças', rota: '/estoque-pecas' },
  { codigo: 'COMODATO', nome: 'Comodato', rota: '/comodato' },
  { codigo: 'TI', nome: 'Tecnologia da Informação', rota: '/ti' },
]
export const nomeArea = (c: string) => AREAS.find((a) => a.codigo === c)?.nome ?? c

export interface Atribuicao {
  papel: Papel
  area: AreaCodigo | null // null = todas
  unidadeId: number | null
}

export interface UsuarioSessao {
  id: string
  nome: string
  atribuicoes: Atribuicao[]
  deveTrocarSenha: boolean
}

export type Acao =
  | 'dados.ler'
  | 'dados.editar'
  | 'dados.restritos.ler' // e-mail, ramal, IP (TI)
  | 'analise.editar'
  | 'plano.editar'
  | 'plano.aprovar_encerramento'
  | 'periodo.preencher' // RASCUNHO -> EM_PREENCHIMENTO
  | 'periodo.enviar_validacao' // -> EM_VALIDACAO
  | 'periodo.devolver' // EM_VALIDACAO -> EM_PREENCHIMENTO
  | 'periodo.aprovar' // EM_VALIDACAO -> APROVADO
  | 'periodo.fechar' // APROVADO -> FECHADO
  | 'periodo.reabrir' // APROVADO/FECHADO -> EM_PREENCHIMENTO (justificativa)
  | 'painel.ler'
  | 'painel.comentar'
  | 'relatorio.gerar'
  | 'metas.propor'
  | 'metas.aprovar'
  | 'indicadores.configurar'
  | 'cadastros.editar'
  | 'usuarios.gerir'
  | 'configuracao.editar'
  | 'importacao.executar'
  | 'importacao.homologar'
  | 'auditoria.ler'

const POR_PAPEL: Record<Papel, Acao[]> = {
  ADMIN: [
    'dados.ler', 'dados.editar', 'dados.restritos.ler', 'analise.editar', 'plano.editar', 'plano.aprovar_encerramento',
    'periodo.preencher', 'periodo.enviar_validacao', 'periodo.devolver', 'periodo.fechar', 'periodo.reabrir',
    'painel.ler', 'painel.comentar', 'relatorio.gerar', 'metas.propor', 'indicadores.configurar',
    'cadastros.editar', 'usuarios.gerir', 'configuracao.editar', 'importacao.executar', 'importacao.homologar', 'auditoria.ler',
  ],
  LANCADOR: ['dados.ler', 'dados.editar', 'periodo.preencher', 'painel.ler'],
  GESTOR: [
    'dados.ler', 'dados.editar', 'dados.restritos.ler', 'analise.editar', 'plano.editar', 'periodo.preencher',
    'periodo.enviar_validacao', 'painel.ler', 'painel.comentar', 'relatorio.gerar', 'metas.propor',
  ],
  DIRETORIA: [
    'dados.ler', 'painel.ler', 'painel.comentar', 'relatorio.gerar', 'periodo.aprovar', 'periodo.devolver',
    'periodo.fechar', 'metas.aprovar', 'plano.aprovar_encerramento', 'importacao.homologar',
  ],
  AUDITOR: ['dados.ler', 'painel.ler', 'relatorio.gerar', 'auditoria.ler'],
}

/** Ações cujo escopo é global (não dependem da área). */
const GLOBAIS: Acao[] = ['usuarios.gerir', 'configuracao.editar', 'cadastros.editar', 'importacao.executar',
  'importacao.homologar', 'auditoria.ler', 'indicadores.configurar']

export function pode(u: Pick<UsuarioSessao, 'atribuicoes'> | null | undefined, acao: Acao, area?: string | null): boolean {
  if (!u) return false
  return u.atribuicoes.some((a) => {
    if (!POR_PAPEL[a.papel].includes(acao)) return false
    // Ações globais exigem atribuição sem restrição de área
    if (GLOBAIS.includes(acao)) return a.area === null
    // Sem área informada: basta ter a ação em alguma área (ex.: exibir menu)
    if (!area) return true
    return a.area === null || a.area === area
  })
}

/** Áreas em que o usuário pode executar a ação. */
export function areasPermitidas(u: Pick<UsuarioSessao, 'atribuicoes'>, acao: Acao): AreaCodigo[] {
  return AREAS.map((a) => a.codigo).filter((c) => pode(u, acao, c))
}

export function temPapel(u: Pick<UsuarioSessao, 'atribuicoes'> | null | undefined, ...papeis: Papel[]) {
  return !!u?.atribuicoes.some((a) => papeis.includes(a.papel))
}

export class AcessoNegado extends Error {
  constructor(msg = 'Acesso negado para o seu perfil.') {
    super(msg)
    this.name = 'AcessoNegado'
  }
}

export function exigir(u: UsuarioSessao | null, acao: Acao, area?: string | null): asserts u is UsuarioSessao {
  if (!pode(u, acao, area)) throw new AcessoNegado()
}
