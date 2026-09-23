/**
 * Fila assíncrona da central de relatórios (tabela relatorio_job).
 *  - solicitarRelatorio: valida e enfileira (NA_FILA);
 *  - processarProximo: pega um job com "for update skip locked", gera o arquivo, aloca a versão
 *    de forma atômica (lock consultivo por formato/escopo/modo/competência) e grava em `arquivo`;
 *  - processarFilaEmSegundoPlano: dispara o processamento sem bloquear a requisição
 *    (after() do Next quando disponível; senão setImmediate). Em produção, scripts/worker.ts.
 */
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { z } from 'zod'
import { q, q1, tx } from '@/lib/db'
import { validarCompetencia } from '@/lib/competencia'
import { pode, type Atribuicao } from '@/lib/auth/permissoes'
import { montarDadosRelatorio } from './dados'
import { gerarXlsx } from './xlsx'
import { gerarPptx } from './pptx'
import { gerarPdfA4, gerarPdfApresentacao } from './pdf'
import { MIME, nomeArquivo } from './nomes'
import type { DadosRelatorio, EscopoRelatorio, FormatoRelatorio, ModoRelatorio, UsuarioRelatorio } from './tipos'

export const MAX_TENTATIVAS = 2

export const esquemaSolicitacao = z.object({
  competencia: z.string().refine(validarCompetencia, 'Competência inválida.'),
  escopo: z.enum(['CONSOLIDADO', 'COMODATO_MANUTENCAO', 'TI']),
  modo: z.enum(['EXECUTIVO', 'COMPLETO']),
  formato: z.enum(['XLSX', 'PDF_A4', 'PDF_APRESENTACAO', 'PPTX']),
  unidades: z.array(z.number().int().positive()).max(50).nullable().optional(),
})
export type SolicitacaoRelatorio = z.infer<typeof esquemaSolicitacao>

export interface JobRelatorio {
  id: number
  formato: FormatoRelatorio
  modo: ModoRelatorio
  escopo: EscopoRelatorio
  competencia: string
  unidades: number[] | null
  status: 'NA_FILA' | 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO'
  progresso: number
  etapa: string | null
  mensagem_erro: string | null
  versao: number | null
  situacao_fechamento: 'OFICIAL' | 'PRELIMINAR' | null
  arquivo_nome: string | null
  arquivo_id: string | null
  hash_dados: string | null
  solicitado_por: string
  solicitado_por_nome?: string
  solicitado_em: string
  iniciado_em: string | null
  concluido_em: string | null
  tentativas: number
}

export class ErroRelatorio extends Error {}

export async function carregarUsuarioRelatorio(id: string): Promise<UsuarioRelatorio | null> {
  const rows = await q<{ id: string; nome: string; papel: string | null; area_codigo: string | null; unidade_id: number | null }>(
    `select u.id, u.nome, p.papel, p.area_codigo, p.unidade_id from usuario u left join usuario_papel p on p.usuario_id = u.id where u.id = $1 and u.ativo`, [id])
  if (!rows.length) return null
  return {
    id: rows[0].id, nome: rows[0].nome,
    atribuicoes: rows.filter((r) => r.papel).map((r) => ({ papel: r.papel, area: r.area_codigo, unidadeId: r.unidade_id }) as Atribuicao),
  }
}

/** Enfileira um relatório. Lança ErroRelatorio para entradas inválidas ou sem permissão. */
export async function solicitarRelatorio(entrada: SolicitacaoRelatorio, usuario: Pick<UsuarioRelatorio, 'id' | 'atribuicoes'>): Promise<number> {
  if (!pode(usuario, 'relatorio.gerar')) throw new ErroRelatorio('Seu perfil não pode gerar relatórios.')
  const p = esquemaSolicitacao.safeParse(entrada)
  if (!p.success) throw new ErroRelatorio(p.error.issues.map((i) => i.message).join(' '))
  const s = p.data
  const unidades = s.unidades?.length ? [...new Set(s.unidades)].sort((a, b) => a - b) : null
  const r = await tx({ usuarioId: usuario.id, contexto: { acao: 'SOLICITAR_RELATORIO' } }, async (db) => q1<{ id: number }>(
    `insert into relatorio_job (formato, modo, escopo, competencia, unidades, filtros, solicitado_por)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [s.formato, s.modo, s.escopo, s.competencia, unidades, JSON.stringify({ competencia: s.competencia, escopo: s.escopo, modo: s.modo, unidades }), usuario.id], db))
  return r!.id
}

async function progresso(id: number, pct: number, etapa: string) {
  await q(`update relatorio_job set progresso = $2, etapa = $3 where id = $1 and status = 'PROCESSANDO'`, [id, pct, etapa])
}

async function renderizar(formato: FormatoRelatorio, d: DadosRelatorio): Promise<Buffer> {
  switch (formato) {
    case 'XLSX': return gerarXlsx(d)
    case 'PPTX': return gerarPptx(d)
    case 'PDF_A4': return gerarPdfA4(d)
    case 'PDF_APRESENTACAO': return gerarPdfApresentacao(d)
  }
}

function mensagemSegura(e: unknown): string {
  if (e instanceof ErroRelatorio) return e.message
  const msg = (e as { message?: string })?.message ?? ''
  if (/Executable doesn't exist|browserType\.launch/i.test(msg)) return 'Gerador de PDF indisponível no servidor (navegador não encontrado). Acione o suporte.'
  return 'Falha ao gerar o relatório. Tente novamente; se persistir, acione o suporte.'
}

/** Processa o próximo job da fila. Retorna o job final (ou null se a fila está vazia). */
export async function processarProximo(): Promise<JobRelatorio | null> {
  // Jobs interrompidos (queda do processo) sem tentativas restantes viram erro.
  await q(`update relatorio_job set status = 'ERRO', etapa = 'Erro', concluido_em = now(),
             mensagem_erro = 'Processamento interrompido. Solicite novamente.'
            where status = 'PROCESSANDO' and iniciado_em < now() - interval '15 minutes' and tentativas >= $1`, [MAX_TENTATIVAS])
  const job = await q1<JobRelatorio>(
    `update relatorio_job set status = 'PROCESSANDO', progresso = 5, etapa = 'Iniciando', iniciado_em = now(), tentativas = tentativas + 1, mensagem_erro = null
      where id = (select id from relatorio_job
                   where status = 'NA_FILA' or (status = 'PROCESSANDO' and iniciado_em < now() - interval '15 minutes' and tentativas < $1)
                   order by solicitado_em, id for update skip locked limit 1)
      returning id, formato, modo, escopo, competencia::text, unidades, status, progresso, etapa, tentativas, solicitado_por`, [MAX_TENTATIVAS])
  if (!job) return null
  const inicio = Date.now()
  try {
    const usuario = await carregarUsuarioRelatorio(job.solicitado_por)
    if (!usuario || !pode(usuario, 'relatorio.gerar')) throw new ErroRelatorio('O solicitante não tem mais permissão para gerar relatórios.')
    await progresso(job.id, 10, 'Calculando indicadores')
    const dados = await montarDadosRelatorio({
      competencia: job.competencia, escopo: job.escopo, modo: job.modo, unidades: job.unidades, usuario, incluirDetalhes: job.formato === 'XLSX',
    })
    await progresso(job.id, 40, 'Montando o conteúdo')
    const chave = `relatorio:${job.formato}:${job.escopo}:${job.modo}:${job.competencia}`
    await progresso(job.id, 70, 'Gerando o arquivo')
    const final = await tx({ usuarioId: job.solicitado_por, contexto: { acao: 'EXPORTACAO_RELATORIO', job: job.id } }, async (db) => {
      // Versão sequencial por (formato, escopo, modo, competência), alocada atomicamente na conclusão.
      await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [chave])
      const v = await q1<{ v: number }>(`select coalesce(max(versao), 0) + 1 as v from relatorio_job where formato = $1 and escopo = $2 and modo = $3 and competencia = $4`,
        [job.formato, job.escopo, job.modo, job.competencia], db)
      const versao = v!.v
      dados.metadados.versao = versao
      const conteudo = await renderizar(job.formato, dados)
      await progresso(job.id, 90, 'Armazenando')
      const nome = nomeArquivo(job.formato, job.escopo, job.competencia, versao)
      const sha = createHash('sha256').update(conteudo).digest('hex')
      const arq = await q1<{ id: string }>(
        `insert into arquivo (nome, mime, tamanho, sha256, conteudo, categoria, criado_por) values ($1,$2,$3,$4,$5,'RELATORIO',$6) returning id`,
        [nome, MIME[job.formato], conteudo.length, sha, conteudo, job.solicitado_por], db)
      const upd = await q1<JobRelatorio>(
        `update relatorio_job set status = 'CONCLUIDO', progresso = 100, etapa = 'Concluído', versao = $2, arquivo_id = $3, arquivo_nome = $4,
                situacao_fechamento = $5, hash_dados = $6, concluido_em = now(), mensagem_erro = null
          where id = $1 returning id, formato, modo, escopo, competencia::text, status, progresso, etapa, versao, situacao_fechamento, arquivo_nome, arquivo_id, hash_dados, tentativas, solicitado_por`,
        [job.id, versao, arq!.id, nome, dados.metadados.selo, dados.hash], db)
      await db.query(`insert into evento_sistema (tipo, usuario_id, detalhes) values ('EXPORTACAO_RELATORIO', $1, $2)`, [job.solicitado_por, JSON.stringify({
        job_id: job.id, resultado: 'CONCLUIDO', formato: job.formato, escopo: job.escopo, modo: job.modo, competencia: job.competencia, versao,
        arquivo_nome: nome, tamanho: conteudo.length, sha256: sha, hash_dados: dados.hash, selo: dados.metadados.selo, duracao_ms: Date.now() - inicio,
      })])
      return upd!
    })
    return final
  } catch (e) {
    console.error(`[relatorios] job ${job.id} falhou:`, e)
    const msg = mensagemSegura(e)
    const definitivo = e instanceof ErroRelatorio || job.tentativas >= MAX_TENTATIVAS
    const r = await q1<JobRelatorio>(
      `update relatorio_job set status = $2, etapa = $3, mensagem_erro = $4, progresso = case when $2 = 'ERRO' then progresso else 0 end,
              concluido_em = case when $2 = 'ERRO' then now() else null end
        where id = $1 returning id, formato, modo, escopo, competencia::text, status, progresso, etapa, mensagem_erro, tentativas, solicitado_por`,
      [job.id, definitivo ? 'ERRO' : 'NA_FILA', definitivo ? 'Erro' : 'Aguardando nova tentativa', msg])
    await q(`insert into evento_sistema (tipo, usuario_id, detalhes) values ('EXPORTACAO_RELATORIO', $1, $2)`, [job.solicitado_por, JSON.stringify({
      job_id: job.id, resultado: definitivo ? 'ERRO' : 'NOVA_TENTATIVA', formato: job.formato, escopo: job.escopo, modo: job.modo, competencia: job.competencia, tentativa: job.tentativas,
    })]).catch(() => {})
    return r ?? null
  }
}

let drenando: Promise<void> | null = null
/** Processa a fila até esvaziar (um processamento por vez neste processo). */
export function drenarFila(): Promise<void> {
  if (!drenando) {
    drenando = (async () => {
      try { while (await processarProximo()) { /* continua */ } } finally { drenando = null }
    })()
  }
  return drenando
}

/** Dispara o processamento sem bloquear a resposta. */
export function processarFilaEmSegundoPlano(): void {
  const tarefa = () => drenarFila().catch((e) => console.error('[relatorios] fila:', e))
  try {
    after(tarefa)
  } catch {
    setImmediate(tarefa)
  }
}

/* ------------------------------------------------------------------ consultas para a interface */

const COLUNAS_JOB = `j.id, j.formato, j.modo, j.escopo, j.competencia::text, j.unidades, j.status, j.progresso, j.etapa, j.mensagem_erro, j.versao,
  j.situacao_fechamento, j.arquivo_nome, j.arquivo_id, j.hash_dados, j.solicitado_por, u.nome as solicitado_por_nome, j.solicitado_em::text,
  j.iniciado_em::text, j.concluido_em::text, j.tentativas`

export async function listarJobs(usuario: Pick<UsuarioRelatorio, 'id' | 'atribuicoes'>, limite = 30): Promise<JobRelatorio[]> {
  const todos = pode(usuario, 'painel.ler')
  return q<JobRelatorio>(`select ${COLUNAS_JOB} from relatorio_job j join usuario u on u.id = j.solicitado_por
     where ($1::boolean or j.solicitado_por = $2) order by j.solicitado_em desc, j.id desc limit $3`, [todos, usuario.id, limite])
}

export async function lerJob(id: number, usuario: Pick<UsuarioRelatorio, 'id' | 'atribuicoes'>): Promise<JobRelatorio | null> {
  const j = await q1<JobRelatorio>(`select ${COLUNAS_JOB} from relatorio_job j join usuario u on u.id = j.solicitado_por where j.id = $1`, [id])
  if (!j) return null
  if (j.solicitado_por !== usuario.id && !pode(usuario, 'painel.ler')) return null
  return j
}

