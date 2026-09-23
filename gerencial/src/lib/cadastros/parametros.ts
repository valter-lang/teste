import { z } from 'zod'

/**
 * Parâmetros de configuração editáveis (tabela configuracao). Cada chave tem tipo,
 * esquema de validação (zod) e conversão a partir do formulário. Sem acesso ao banco.
 */

export type TipoParametro = 'data' | 'inteiro' | 'inteiro_opcional' | 'decimal' | 'booleano' | 'areas' | 'opcao' | 'lista_texto'

export interface ParametroDef {
  chave: string
  rotulo: string
  tipo: TipoParametro
  ajuda: string
  opcoes?: { valor: string; rotulo: string }[]
  padrao: unknown
  esquema: z.ZodType<unknown>
}

export const AREAS_FECHAMENTO = [
  { valor: 'MANUT_INTERNA', rotulo: 'Manutenção interna' },
  { valor: 'MANUT_EXTERNA', rotulo: 'Manutenção externa' },
  { valor: 'ESTOQUE_PECAS', rotulo: 'Estoque de peças' },
  { valor: 'COMODATO', rotulo: 'Comodato' },
  { valor: 'TI', rotulo: 'Tecnologia da Informação' },
]

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
  .refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Data inválida.')

export const PARAMETROS: ParametroDef[] = [
  {
    chave: 'migracao.data_corte', rotulo: 'Data de corte da migração', tipo: 'data', padrao: '2026-09-01',
    ajuda: 'Primeiro dia do mês a partir do qual os indicadores usam os lançamentos do sistema (antes: histórico migrado).',
    esquema: dataIso.refine((s) => s.endsWith('-01'), 'A data de corte deve ser o primeiro dia de um mês.'),
  },
  {
    chave: 'manut_externa.janela_reincidencia_dias', rotulo: 'Janela de reincidência (dias)', tipo: 'inteiro_opcional', padrao: null,
    ajuda: 'Deixe em branco enquanto a regra não for homologada: conta apenas vínculos explícitos de reincidência.',
    esquema: z.number().int('Informe um número inteiro.').min(1, 'Mínimo de 1 dia.').max(365, 'Máximo de 365 dias.').nullable(),
  },
  {
    chave: 'manut_externa.sla_primeira_resposta_horas_uteis', rotulo: 'SLA de primeira resposta (horas úteis)', tipo: 'inteiro', padrao: 48,
    ajuda: 'Prazo da primeira resposta aos chamados de manutenção externa, em horas úteis.',
    esquema: z.number().int('Informe um número inteiro.').min(1, 'Mínimo de 1 hora.').max(720, 'Máximo de 720 horas.'),
  },
  {
    chave: 'semaforo.tolerancia_padrao_pct', rotulo: 'Tolerância padrão do semáforo (%)', tipo: 'decimal', padrao: 5,
    ajuda: 'Faixa amarela (atenção), relativa à meta e na direção do indicador.',
    esquema: z.number().min(0, 'Não pode ser negativa.').max(50, 'Máximo de 50%.'),
  },
  {
    chave: 'ti.backlog_dias_uteis', rotulo: 'Backlog envelhecido de TI (dias úteis)', tipo: 'inteiro', padrao: 7,
    ajuda: 'Idade mínima, em dias úteis, para um chamado aberto contar no backlog envelhecido.',
    esquema: z.number().int('Informe um número inteiro.').min(1, 'Mínimo de 1 dia.').max(120, 'Máximo de 120 dias.'),
  },
  {
    chave: 'ranking.volume_minimo', rotulo: 'Volume mínimo para rankings', tipo: 'inteiro', padrao: 3,
    ajuda: 'Itens com volume menor não aparecem em rankings (evita distorções estatísticas).',
    esquema: z.number().int('Informe um número inteiro.').min(1, 'Mínimo de 1.').max(1000, 'Máximo de 1000.'),
  },
  {
    chave: 'privacidade.anonimizar_nomes_diretoria', rotulo: 'Anonimizar nomes nas visões da Diretoria', tipo: 'booleano', padrao: false,
    ajuda: 'Substitui nomes de solicitantes e técnicos por iniciais nas telas e relatórios da Diretoria.',
    esquema: z.boolean(),
  },
  {
    chave: 'fechamento.areas_obrigatorias', rotulo: 'Áreas obrigatórias no fechamento', tipo: 'areas',
    padrao: AREAS_FECHAMENTO.map((a) => a.valor), opcoes: AREAS_FECHAMENTO,
    ajuda: 'Áreas cujo fechamento aprovado é exigido para o selo "Oficial" do mês.',
    esquema: z.array(z.enum(['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI'])).min(1, 'Selecione ao menos uma área.'),
  },
  {
    chave: 'relatorio.fonte_exportacao', rotulo: 'Fonte das exportações', tipo: 'opcao', padrao: 'OFICIAL',
    opcoes: [{ valor: 'OFICIAL', rotulo: 'Oficial (Plus Jakarta Sans / Nunito)' }, { valor: 'SEGURA', rotulo: 'Segura (Arial / Calibri)' }],
    ajuda: 'Use "Segura" quando os relatórios forem abertos em máquinas sem as fontes oficiais.',
    esquema: z.enum(['OFICIAL', 'SEGURA'], { message: 'Opção inválida.' }),
  },
  {
    chave: 'integracao.base_instalada.status_ativos', rotulo: 'Status AA3 considerados ativos (base instalada)', tipo: 'lista_texto', padrao: ['01'],
    ajuda: 'Códigos AA3_STATUS somados como equipamentos ativos, separados por vírgula (ex.: 01, 02). Significado vindo do painel legado: 01 Ativo, 02 Em uso, 03 Manutenção, X1 Pendente — pendente de homologação.',
    esquema: z.array(z.string().regex(/^[A-Z0-9]{1,4}$/, 'Código de status inválido (1 a 4 letras/números).')).min(1, 'Informe ao menos um status.'),
  },
]

export const parametroPorChave = (chave: string) => PARAMETROS.find((p) => p.chave === chave)

/** Converte a entrada do formulário no valor JSON do parâmetro e valida. */
export function validarParametro(chave: string, entrada: { valor?: string | null; valores?: string[] }):
  { ok: true; valor: unknown } | { ok: false; erro: string } {
  const def = parametroPorChave(chave)
  if (!def) return { ok: false, erro: 'Parâmetro desconhecido.' }
  const s = (entrada.valor ?? '').trim()
  let bruto: unknown
  switch (def.tipo) {
    case 'data':
    case 'opcao':
      bruto = s
      break
    case 'inteiro':
    case 'decimal':
      if (s === '') return { ok: false, erro: 'Informe um valor.' }
      bruto = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
      if (!Number.isFinite(bruto as number)) return { ok: false, erro: 'Número inválido.' }
      break
    case 'inteiro_opcional':
      bruto = s === '' ? null : Number(s)
      if (bruto !== null && !Number.isFinite(bruto as number)) return { ok: false, erro: 'Número inválido.' }
      break
    case 'booleano':
      bruto = s === 'true' || s === 'on' || s === 'sim'
      break
    case 'areas':
      bruto = [...new Set(entrada.valores ?? [])]
      break
    case 'lista_texto':
      bruto = [...new Set(s.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))]
      break
  }
  const r = def.esquema.safeParse(bruto)
  return r.success ? { ok: true, valor: r.data } : { ok: false, erro: r.error.issues[0]?.message ?? 'Valor inválido.' }
}

/* ------------------------------------------------------------------ */
/* Expediente oficial (calendario.expediente)                          */
/* ------------------------------------------------------------------ */

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM).')

function fusoValido(f: string) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: f })
    return true
  } catch {
    return false
  }
}

export const esquemaExpediente = z.object({
  fuso: z.string().min(1, 'Informe o fuso horário.').refine(fusoValido, 'Fuso horário inválido (ex.: America/Sao_Paulo).'),
  dias_uteis: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia útil.'),
  inicio: hora,
  fim: hora,
}).refine((e) => e.inicio < e.fim, { message: 'O fim do expediente deve ser posterior ao início.', path: ['fim'] })

export type Expediente = z.infer<typeof esquemaExpediente>

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function validarExpediente(entrada: { fuso?: string; dias?: string[]; inicio?: string; fim?: string }):
  { ok: true; valor: Expediente } | { ok: false; erro: string } {
  const r = esquemaExpediente.safeParse({
    fuso: (entrada.fuso ?? '').trim(),
    dias_uteis: [...new Set((entrada.dias ?? []).map(Number))].sort((a, b) => a - b),
    inicio: (entrada.inicio ?? '').trim(),
    fim: (entrada.fim ?? '').trim(),
  })
  return r.success ? { ok: true, valor: r.data } : { ok: false, erro: r.error.issues[0]?.message ?? 'Expediente inválido.' }
}

/** Formata o valor JSON de um parâmetro para exibição. */
export function exibirParametro(def: ParametroDef, valor: unknown): string {
  if (valor === null || valor === undefined) return 'Não definido'
  if (def.tipo === 'booleano') return valor ? 'Sim' : 'Não'
  if (def.tipo === 'areas' && Array.isArray(valor)) return valor.map((v) => AREAS_FECHAMENTO.find((a) => a.valor === v)?.rotulo ?? v).join(', ')
  if (def.tipo === 'lista_texto' && Array.isArray(valor)) return valor.join(', ')
  if (def.tipo === 'opcao') return def.opcoes?.find((o) => o.valor === valor)?.rotulo ?? String(valor)
  if (def.tipo === 'data') return String(valor).split('-').reverse().join('/')
  return String(valor).replace('.', ',')
}
