/** Nomes de arquivo, rótulos e utilitários de texto seguros para exportação. */
import type { EscopoRelatorio, FormatoRelatorio, ModoRelatorio, SecaoId } from './tipos'
import type { AreaCodigo } from '@/lib/auth/permissoes'

export const ROTULO_FORMATO: Record<FormatoRelatorio, string> = {
  XLSX: 'Excel (.xlsx)',
  PDF_A4: 'PDF A4 (relatório)',
  PDF_APRESENTACAO: 'PDF apresentação (16:9)',
  PPTX: 'PowerPoint (.pptx)',
}
export const ROTULO_ESCOPO: Record<EscopoRelatorio, string> = {
  CONSOLIDADO: 'Consolidado',
  COMODATO_MANUTENCAO: 'Comodato e Manutenção',
  TI: 'Tecnologia da Informação',
}
export const ROTULO_MODO: Record<ModoRelatorio, string> = { EXECUTIVO: 'Executivo', COMPLETO: 'Completo' }

export const AREAS_DO_ESCOPO: Record<EscopoRelatorio, AreaCodigo[]> = {
  CONSOLIDADO: ['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI'],
  COMODATO_MANUTENCAO: ['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO'],
  TI: ['TI'],
}

export const SECOES: { id: SecaoId; titulo: string; area: AreaCodigo }[] = [
  { id: 'MANUT_INTERNA', titulo: 'Manutenção interna', area: 'MANUT_INTERNA' },
  { id: 'MANUT_EXTERNA', titulo: 'Manutenção externa', area: 'MANUT_EXTERNA' },
  { id: 'ESTOQUE_PECAS', titulo: 'Estoque de peças', area: 'ESTOQUE_PECAS' },
  { id: 'COMODATO_BASE', titulo: 'Comodato — base, movimentação e consumo', area: 'COMODATO' },
  { id: 'COMODATO_ATENDIMENTO', titulo: 'Comodato — atendimento, trocas e estoque', area: 'COMODATO' },
  { id: 'TI_OPERACAO', titulo: 'TI — operação e serviços', area: 'TI' },
  { id: 'TI_CONTINUIDADE', titulo: 'TI — continuidade, segurança e projetos', area: 'TI' },
]
export const tituloSecao = (s: SecaoId) => SECOES.find((x) => x.id === s)?.titulo ?? s

/** Seção de cada indicador (os demais seguem a primeira seção da área). */
const SECAO_INDICADOR: Record<string, SecaoId> = {
  ME_TROCAS: 'COMODATO_ATENDIMENTO',
  CO_ENTREGAS_SEM_EXITO: 'COMODATO_ATENDIMENTO',
  CO_ENTREGA_1A_TENTATIVA: 'COMODATO_ATENDIMENTO',
  CO_LEAD_TIME: 'COMODATO_ATENDIMENTO',
  CO_PARADO_30_60_90: 'COMODATO_ATENDIMENTO',
  TI_DISPONIBILIDADE: 'TI_CONTINUIDADE',
  TI_BACKUP: 'TI_CONTINUIDADE',
  TI_TESTES_RESTAURACAO: 'TI_CONTINUIDADE',
  TI_P1_SEM_CAUSA: 'TI_CONTINUIDADE',
  TI_PROJETOS_CRONOGRAMA: 'TI_CONTINUIDADE',
  TI_PATCHES_30D: 'TI_CONTINUIDADE',
  TI_SEGURANCA_PENDENTES: 'TI_CONTINUIDADE',
  TI_CHANGE_FAILURE: 'TI_CONTINUIDADE',
}
export function secaoDoIndicador(codigo: string, area: AreaCodigo): SecaoId {
  if (SECAO_INDICADOR[codigo]) return SECAO_INDICADOR[codigo]
  return SECOES.find((s) => s.area === area)!.id
}

/** Grupos fixos das apresentações isoladas (6 slides de indicadores, padrão gerencial). */
export const GRUPOS_ISOLADOS: Record<'COMODATO_MANUTENCAO' | 'TI', { titulo: string; codigos: string[]; quebra?: string }[]> = {
  COMODATO_MANUTENCAO: [
    { titulo: 'Base instalada e movimento do parque', codigos: ['CO_BASE_ATIVA', 'CO_MOV_LIQUIDO'], quebra: 'CO_ENTREGAS_FAMILIA' },
    { titulo: 'Consumo dos clientes em comodato', codigos: ['CO_VOLUME_POR_EQUIP', 'CO_CLIENTES_ABAIXO_MIN'] },
    { titulo: 'Manutenção interna', codigos: ['MI_SUCATEADOS', 'MI_RECUPERACOES'], quebra: 'MI_RECUPERADOS_FAMILIA' },
    { titulo: 'Chamados externos e SLA', codigos: ['ME_CHAMADOS_100EQ', 'ME_SLA_PRIMEIRA_RESPOSTA'], quebra: 'ME_CHAMADOS_FAMILIA' },
    { titulo: 'Qualidade do atendimento externo', codigos: ['ME_REINCIDENCIA', 'ME_DESNECESSARIOS'], quebra: 'ME_DESNECESSARIOS_MOTIVO' },
    { titulo: 'Estoque de peças e trocas', codigos: ['EP_FALTA_PECA_CRITICA', 'EP_VALOR_SAIDAS', 'ME_TROCAS'], quebra: 'EP_SAIDA_FAMILIA' },
  ],
  TI: [
    { titulo: 'Disponibilidade dos sistemas críticos', codigos: ['TI_DISPONIBILIDADE'] },
    { titulo: 'SLA e tempo de resolução', codigos: ['TI_SLA', 'TI_MTTR'], quebra: 'TI_RESOLVIDOS_PRIORIDADE' },
    { titulo: 'Volume e backlog de chamados', codigos: ['TI_CHAMADOS_ABERTOS', 'TI_BACKLOG_7DU'], quebra: 'TI_ABERTOS_CATEGORIA' },
    { titulo: 'Backup e restauração', codigos: ['TI_BACKUP', 'TI_TESTES_RESTAURACAO'] },
    { titulo: 'Incidentes críticos e segurança', codigos: ['TI_P1_SEM_CAUSA', 'TI_SEGURANCA_PENDENTES'] },
    { titulo: 'Projetos e atualizações', codigos: ['TI_PROJETOS_CRONOGRAMA', 'TI_PATCHES_30D'] },
  ],
}

const SUFIXO_ESCOPO: Record<EscopoRelatorio, string> = { CONSOLIDADO: '', COMODATO_MANUTENCAO: '_Comodato_Manutencao', TI: '_TI' }

/** Costa_Lavos_Relatorio_Executivo_<AAAA-MM>[_escopo]_v<NN>.xlsx|pdf / Costa_Lavos_Apresentacao_Diretoria_... .pptx|pdf */
export function nomeArquivo(formato: FormatoRelatorio, escopo: EscopoRelatorio, competencia: string, versao: number): string {
  const aaaamm = competencia.slice(0, 7)
  const v = `_v${String(versao).padStart(2, '0')}`
  const base = formato === 'XLSX' || formato === 'PDF_A4' ? 'Costa_Lavos_Relatorio_Executivo' : 'Costa_Lavos_Apresentacao_Diretoria'
  const ext = formato === 'XLSX' ? 'xlsx' : formato === 'PPTX' ? 'pptx' : 'pdf'
  return `${base}_${aaaamm}${SUFIXO_ESCOPO[escopo]}${v}.${ext}`
}

export const MIME: Record<FormatoRelatorio, string> = {
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF_A4: 'application/pdf',
  PDF_APRESENTACAO: 'application/pdf',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** Escapa texto para HTML/SVG. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_TELEFONE = /(\+?55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}[-.\s]?\d{4}\b/g
const RE_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g

/** Remove dados pessoais de contato de textos livres (e-mail, telefone, IP). */
export function sanitizarTexto(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return v.replace(RE_EMAIL, '[contato removido]').replace(RE_IP, '[IP removido]').replace(RE_TELEFONE, '[telefone removido]').replace(/@/g, '(a)')
}

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
/** "João da Silva" -> "J. S." */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()))
  if (!partes.length) return nome
  return partes.map((p) => `${p[0].toUpperCase()}.`).join(' ')
}
