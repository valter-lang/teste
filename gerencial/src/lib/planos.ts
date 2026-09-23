import { z } from 'zod'

/** Ações vagas proibidas: verbos de acompanhamento sem entregável concreto. */
const VAGAS = /^(acompanhar|monitorar|verificar|observar|avaliar|analisar|melhorar|ver|checar|conferir)\b/i

export function acaoVaga(acao: string, entregavel: string): string | null {
  const a = acao.trim()
  if (a.split(/\s+/).length < 3) return 'Descreva a ação de forma objetiva (o que será feito, onde e como).'
  if (VAGAS.test(a) && entregavel.trim().length < 10) return 'Ação vaga: “acompanhar/monitorar/verificar” exige entregável concreto, responsável e prazo.'
  if (/^(acompanhar|monitorar)\s*\.?$/i.test(a)) return 'Ação vaga não é permitida.'
  return null
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

export const EsquemaPlano = z.object({
  area_codigo: z.enum(['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI']),
  indicador_codigo: z.string().trim().max(60).optional().transform((v) => v || null),
  competencia_origem: z.string().regex(/^\d{4}-\d{2}-01$/).optional().or(z.literal('')).transform((v) => v || null),
  ocorrencia: z.string().trim().max(500).optional().transform((v) => v || null),
  cliente_id: z.coerce.number().int().positive().optional().or(z.literal('')).transform((v) => (v === '' ? null : v ?? null)),
  causa_raiz: z.string().trim().min(10, 'Descreva a causa raiz (mín. 10 caracteres).').max(2000),
  acao: z.string().trim().min(10, 'Descreva a ação (mín. 10 caracteres).').max(2000),
  entregavel: z.string().trim().min(5, 'Informe o entregável.').max(500),
  responsavel_nome: z.string().trim().min(3, 'Informe o responsável nominal.').max(120),
  inicio: data,
  prazo: data,
  criticidade: z.enum(['ALTA', 'MEDIA', 'BAIXA']),
  resultado_esperado: z.string().trim().min(5, 'Informe o resultado esperado.').max(1000),
}).superRefine((v, ctx) => {
  if (!v.indicador_codigo && !v.ocorrencia) ctx.addIssue({ code: 'custom', path: ['ocorrencia'], message: 'Vincule a um indicador ou descreva a ocorrência de origem.' })
  if (v.prazo < v.inicio) ctx.addIssue({ code: 'custom', path: ['prazo'], message: 'O prazo deve ser igual ou posterior ao início.' })
  const vaga = acaoVaga(v.acao, v.entregavel)
  if (vaga) ctx.addIssue({ code: 'custom', path: ['acao'], message: vaga })
})

export type DadosPlano = z.infer<typeof EsquemaPlano>

export const ROTULO_STATUS_PLANO: Record<string, string> = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_EFICACIA: 'Aguardando eficácia', ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada',
}
