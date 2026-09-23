/**
 * Ciclo de vida da importação histórica:
 *   ANALISADA (arquivo + resumo + pendências) -> GRAVADA (dados nas tabelas)
 *   -> HOMOLOGADA; ou DESCARTADA (remove tudo o que a importação gravou).
 * Toda escrita ocorre em transação com app.usuario_id (auditoria) e, na
 * gravação/descarte, com app.ignorar_bloqueio (dados históricos em períodos fechados).
 */
import type { PoolClient } from 'pg'
import { createHash } from 'node:crypto'
import { pool, q, q1, tx, type Db } from '@/lib/db'
import { normalizarTexto, type FamiliaCatalogo } from './familias'
import { analisarPlanilha, resumoAnalise, type AnalisePlanilha, type PendenciaAnalise, type ResumoAnalise } from './planilha'
import { relatorioReconciliacao } from './reconciliacao'

export class ErroImportacao extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'ErroImportacao'
  }
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** Tipos de pendência que bloqueiam a homologação enquanto não tiverem resolução. */
export const PENDENCIAS_BLOQUEANTES = ['TOTAL_INCOMPATIVEL', 'CONCILIACAO'] as const

export async function carregarCatalogoFamilias(db: Db = pool()): Promise<FamiliaCatalogo[]> {
  const rows = await q<{ id: number; nome: string; aliases: string[] | null }>(
    `select f.id, f.nome, array_remove(array_agg(a.alias), null) as aliases
       from familia_equipamento f left join familia_equipamento_alias a on a.familia_id = f.id
      group by f.id, f.nome order by f.ordem, f.id`, [], db)
  return rows.map((r) => ({ id: r.id, nome: r.nome, aliases: r.aliases ?? [] }))
}

async function inserirPendencias(db: Db, importacaoId: number, pend: PendenciaAnalise[]) {
  for (let i = 0; i < pend.length; i += 500) {
    const lote = pend.slice(i, i + 500).map((p) => ({ aba: p.aba, celula: p.celula, tipo: p.tipo, descricao: p.descricao, valor_bruto: p.valorBruto ?? null }))
    await db.query(
      `insert into importacao_pendencia (importacao_id, aba, celula, tipo, descricao, valor_bruto)
       select $1, x.aba, x.celula, x.tipo, x.descricao, x.valor_bruto
         from jsonb_to_recordset($2::jsonb) as x(aba text, celula text, tipo text, descricao text, valor_bruto jsonb)`,
      [importacaoId, JSON.stringify(lote)],
    )
  }
}

async function exigirShaLivre(db: Db, sha: string, exceto?: number) {
  const r = await q1<{ id: number; status: string }>(
    `select id, status from importacao where arquivo_sha256 = $1 and status in ('GRAVADA','HOMOLOGADA') and id <> coalesce($2, 0) limit 1`, [sha, exceto ?? null], db)
  if (r) throw new ErroImportacao(`Este arquivo já foi gravado na importação #${r.id} (${r.status}). Descarte-a antes de importar novamente.`)
}

/** Grava o arquivo e o resultado da análise (status ANALISADA). */
export async function registrarAnalise(db: PoolClient | null, analise: AnalisePlanilha, arquivoBuffer: Buffer, usuarioId: string): Promise<{ importacaoId: number }> {
  const sha = createHash('sha256').update(arquivoBuffer).digest('hex')
  if (sha !== analise.arquivo.sha256) throw new ErroImportacao('O arquivo não corresponde à análise informada.')
  const executar = async (c: Db) => {
    await exigirShaLivre(c, sha)
    const arq = await q1<{ id: string }>(
      `insert into arquivo (nome, mime, tamanho, sha256, conteudo, categoria, criado_por) values ($1, $2, $3, $4, $5, 'IMPORTACAO', $6) returning id`,
      [analise.arquivo.nome, MIME_XLSX, arquivoBuffer.length, sha, arquivoBuffer, usuarioId], c)
    const imp = await q1<{ id: number }>(
      `insert into importacao (arquivo_id, arquivo_nome, arquivo_sha256, status, resumo, criado_por) values ($1, $2, $3, 'ANALISADA', $4, $5) returning id`,
      [arq!.id, analise.arquivo.nome, sha, JSON.stringify(resumoAnalise(analise)), usuarioId], c)
    await inserirPendencias(c, imp!.id, analise.pendencias)
    return { importacaoId: imp!.id }
  }
  if (db) return executar(db)
  return tx({ usuarioId, contexto: { acao: 'importacao.analisar', sha256: sha } }, executar)
}

/** Analisa (com o catálogo atual do banco) e registra: atalho usado pela tela e pela CLI. */
export async function analisarERegistrar(buffer: Buffer, nomeArquivo: string, usuarioId: string) {
  const analise = await analisarPlanilha(buffer, nomeArquivo, await carregarCatalogoFamilias())
  const { importacaoId } = await registrarAnalise(null, analise, buffer, usuarioId)
  return { importacaoId, analise }
}

interface ImportacaoRow {
  id: number
  status: string
  arquivo_id: string | null
  arquivo_nome: string
  arquivo_sha256: string
  resumo: ResumoAnalise | null
}

async function travar(db: Db, id: number) {
  const r = await q1<ImportacaoRow>('select id, status, arquivo_id, arquivo_nome, arquivo_sha256, resumo from importacao where id = $1 for update', [id], db)
  if (!r) throw new ErroImportacao(`Importação #${id} não encontrada.`)
  return r
}

async function inserirLotes(db: Db, sql: string, linhas: unknown[], extra: unknown[] = [], tam = 1000) {
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < linhas.length; i += tam) {
    const r = await db.query(sql, [JSON.stringify(linhas.slice(i, i + tam)), ...extra])
    out.push(...r.rows)
  }
  return out
}

/** Garante cadastros (nome único por upper) e devolve mapa UPPER(nome) -> id. */
async function garantirCadastro(db: Db, tabela: 'familia_peca' | 'rede' | 'tecnico', nomes: string[]): Promise<Map<string, number>> {
  const unicos = [...new Map(nomes.map((n) => [n.toUpperCase(), n])).values()]
  if (!unicos.length) return new Map()
  if (tabela === 'tecnico') {
    const linhas = unicos.map((n) => {
      const u = normalizarTexto(n)
      return { nome: n, tipo: u === 'TERCEIRO' || u === 'TERCEIROS' ? 'TERCEIRO' : u === 'APOIO' ? 'APOIO' : 'EXTERNO' }
    })
    await db.query(`insert into tecnico (nome, tipo) select x.nome, x.tipo from jsonb_to_recordset($1::jsonb) as x(nome text, tipo text) on conflict (upper(nome)) do nothing`, [JSON.stringify(linhas)])
  } else {
    await db.query(`insert into ${tabela} (nome) select unnest($1::text[]) on conflict (upper(nome)) do nothing`, [unicos])
  }
  const rows = await q<{ id: number; u: string }>(`select id, upper(nome) as u from ${tabela} where upper(nome) = any($1::text[])`, [unicos.map((n) => n.toUpperCase())], db)
  return new Map(rows.map((r) => [r.u, r.id]))
}

export interface OpcoesGravacao {
  /** Aceita todas as propostas de mapeamento (CLI) ... */
  aceitarPropostas: boolean
  /** ... ou somente as chaves informadas (tela). */
  propostasAceitas?: string[]
}

/** Grava os dados analisados nas tabelas de destino (status GRAVADA) e persiste a reconciliação. */
export async function gravarImportacao(importacaoId: number, usuarioId: string, opcoes: OpcoesGravacao) {
  return tx({ usuarioId, ignorarBloqueio: true, contexto: { importacao_id: importacaoId, acao: 'importacao.gravar' } }, async (db) => {
    const imp = await travar(db, importacaoId)
    if (imp.status !== 'ANALISADA') throw new ErroImportacao(`Somente importações ANALISADAS podem ser gravadas (atual: ${imp.status}).`)
    await exigirShaLivre(db, imp.arquivo_sha256, importacaoId)
    const outra = await q1<{ id: number; status: string }>(`select id, status from importacao where status in ('GRAVADA','HOMOLOGADA') and id <> $1 limit 1`, [importacaoId], db)
    if (outra) throw new ErroImportacao(`A importação #${outra.id} (${outra.status}) já ocupa o histórico. Descarte-a antes de gravar uma nova versão da planilha.`)
    const arq = await q1<{ conteudo: Buffer; sha256: string }>('select conteudo, sha256 from arquivo where id = $1', [imp.arquivo_id], db)
    if (!arq || arq.sha256 !== imp.arquivo_sha256) throw new ErroImportacao('Arquivo da importação ausente ou alterado.')

    const catalogo = await carregarCatalogoFamilias(db)
    const analise = await analisarPlanilha(arq.conteudo, imp.arquivo_nome, catalogo)
    const origemBase = { arquivo: imp.arquivo_nome, sha256: imp.arquivo_sha256, importacao_id: importacaoId }

    // 1) Propostas de mapeamento aceitas
    const aceitas = new Set(opcoes.propostasAceitas ?? (opcoes.aceitarPropostas ? analise.propostasMapeamento.map((p) => p.chave) : []))
    const idFamilia = new Map<string, number>(catalogo.map((f) => [f.nome, f.id!]))
    const familiaPorChave = new Map<string, number | null>()
    for (const [chave, nome] of Object.entries(analise.familiasResolvidas)) familiaPorChave.set(chave, idFamilia.get(nome) ?? null)
    const aplicadas: string[] = []
    for (const p of analise.propostasMapeamento) {
      if (!aceitas.has(p.chave) || p.acao === 'MANUAL') {
        familiaPorChave.set(p.chave, null)
        continue
      }
      let fid: number | null = null
      if (p.acao === 'ALIAS' && p.sugestao) {
        fid = idFamilia.get(p.sugestao) ?? null
        if (fid && p.criarAlias) await db.query('insert into familia_equipamento_alias (alias, familia_id) values ($1, $2) on conflict (alias) do nothing', [p.chave, fid])
      } else if (p.acao === 'NOVA_FAMILIA') {
        await db.query(`insert into familia_equipamento (nome, ordem) values ($1, (select coalesce(max(ordem),0) + 1 from familia_equipamento)) on conflict (upper(nome)) do nothing`, [p.chave])
        fid = (await q1<{ id: number }>('select id from familia_equipamento where upper(nome) = upper($1)', [p.chave], db))?.id ?? null
      }
      familiaPorChave.set(p.chave, fid)
      if (fid) aplicadas.push(p.chave)
    }
    const fam = (t: string | null) => (t ? familiaPorChave.get(normalizarTexto(t)) ?? null : null)

    // 2) Cadastros de dimensão
    const nomesDim = (tipo: string) => analise.series.filter((s) => s.dimensaoTipo === tipo && s.dimensaoValor).map((s) => s.dimensaoValor!)
    const pecas = await garantirCadastro(db, 'familia_peca', nomesDim('FAMILIA_PECA'))
    const redes = await garantirCadastro(db, 'rede', nomesDim('REDE'))
    const tecnicos = await garantirCadastro(db, 'tecnico', nomesDim('TECNICO'))
    const dimId = (tipo: string | null, valor: string | null): number | null => {
      if (!tipo || !valor) return null
      if (tipo === 'FAMILIA_EQUIP') return fam(valor)
      const m = tipo === 'FAMILIA_PECA' ? pecas : tipo === 'REDE' ? redes : tipo === 'TECNICO' ? tecnicos : null
      return m?.get(valor.toUpperCase()) ?? null
    }

    // 3) Séries mensais e detalhes
    await inserirLotes(db,
      `insert into historico_agregado (importacao_id, area_codigo, serie, dimensao_tipo, dimensao_valor, dimensao_id, competencia, valor, aba, celula)
       select $2, x.area, x.serie, x.dimensao_tipo, x.dimensao_valor, x.dimensao_id, x.competencia, x.valor, x.aba, x.celula
         from jsonb_to_recordset($1::jsonb) as x(area text, serie text, dimensao_tipo text, dimensao_valor text, dimensao_id int, competencia date, valor numeric, aba text, celula text)`,
      analise.series.map((s) => ({ area: s.area, serie: s.serie, dimensao_tipo: s.dimensaoTipo, dimensao_valor: s.dimensaoValor, dimensao_id: dimId(s.dimensaoTipo, s.dimensaoValor), competencia: s.competencia, valor: s.valor, aba: s.aba, celula: s.celula })),
      [importacaoId])
    await inserirLotes(db,
      `insert into historico_detalhe (importacao_id, area_codigo, tipo, competencia, dados, aba, faixa)
       select $2, x.area, x.tipo, x.competencia, x.dados, x.aba, x.faixa
         from jsonb_to_recordset($1::jsonb) as x(area text, tipo text, competencia date, dados jsonb, aba text, faixa text)`,
      analise.detalhes.map((d) => ({ area: d.area, tipo: d.tipo, competencia: d.competencia, dados: d.dados, aba: d.aba, faixa: d.faixa })),
      [importacaoId])

    // 4) Trocas
    await inserirLotes(db,
      `insert into solicitacao_troca (competencia, cliente_texto, data_solicitacao, data_troca, solicitado_por_texto, familia_id, equipamento_texto, linha, status, observacao, origem, origem_ref, criado_por, atualizado_por)
       select x.competencia, x.cliente_texto, x.data_solicitacao, x.data_troca, x.solicitado_por_texto, x.familia_id, x.equipamento_texto, x.linha, x.status, x.observacao, 'IMPORTACAO', x.origem_ref, $2, $2
         from jsonb_to_recordset($1::jsonb) as x(competencia date, cliente_texto text, data_solicitacao date, data_troca date, solicitado_por_texto text, familia_id int, equipamento_texto text, linha text, status text, observacao text, origem_ref jsonb)`,
      analise.trocas.map((t) => ({
        competencia: t.competencia, cliente_texto: t.clienteTexto, data_solicitacao: t.dataSolicitacao, data_troca: t.dataTroca, solicitado_por_texto: t.solicitadoPorTexto,
        familia_id: fam(t.equipamentoTexto), equipamento_texto: t.equipamentoTexto, linha: t.linha, status: t.status, observacao: t.observacao,
        origem_ref: { ...origemBase, aba: t.aba, linha: t.linhaPlanilha },
      })),
      [usuarioId])

    // 5) Posições de comodato
    const pendExtras: PendenciaAnalise[] = []
    const posIns = await inserirLotes(db,
      `insert into comodato_posicao (competencia, produto, familia_id, posicao_anterior, entradas, saidas_novos, saidas_usados, novos, usados, manutencao_interna,
              custo_total_novos, custo_total_usados, ajuste, justificativa_ajuste, origem, origem_ref, criado_por, atualizado_por)
       select x.competencia, x.produto, x.familia_id, x.posicao_anterior, x.entradas, x.saidas_novos, x.saidas_usados, x.novos, x.usados, x.manutencao_interna,
              x.custo_total_novos, x.custo_total_usados, x.ajuste, x.justificativa_ajuste, 'IMPORTACAO', x.origem_ref, $2, $2
         from jsonb_to_recordset($1::jsonb) as x(competencia date, produto text, familia_id int, posicao_anterior int, entradas int, saidas_novos int, saidas_usados int,
              novos int, usados int, manutencao_interna int, custo_total_novos numeric, custo_total_usados numeric, ajuste int, justificativa_ajuste text, origem_ref jsonb)
       on conflict (competencia, upper(produto), coalesce(unidade_id, 0)) where excluido_em is null do nothing
       returning competencia, produto`,
      analise.posicoesComodato.map((p) => ({
        competencia: p.competencia, produto: p.produto, familia_id: fam(p.produto), posicao_anterior: p.posicaoAnterior, entradas: p.entradas, saidas_novos: p.saidasNovos,
        saidas_usados: p.saidasUsados, novos: p.novos, usados: p.usados, manutencao_interna: p.manutencaoInterna, custo_total_novos: p.custoTotalNovos,
        custo_total_usados: p.custoTotalUsados, ajuste: p.ajuste, justificativa_ajuste: p.justificativaAjuste, origem_ref: { ...origemBase, aba: p.aba, linha: p.linhaPlanilha },
      })),
      [usuarioId])
    const posGravadas = new Set(posIns.map((r) => `${r.competencia}|${String(r.produto).toUpperCase()}`))
    for (const p of analise.posicoesComodato) {
      if (!posGravadas.has(`${p.competencia}|${p.produto.toUpperCase()}`)) {
        pendExtras.push({ aba: p.aba, celula: `A${p.linhaPlanilha}`, tipo: 'DUPLICIDADE', descricao: `Posição de comodato de "${p.produto}" em ${p.competencia.slice(0, 7)} já existe no sistema: não gravada` })
      }
    }

    // 6) Chamados de TI (+ dados restritos)
    const tiIns = await inserirLotes(db,
      `insert into chamado_ti (numero, sistema_origem, competencia, titulo, status, status_normalizado, tipo, prioridade, origem_canal, nivel_suporte, categoria, subcategoria,
              equipe, tecnico_responsavel, solicitante, departamento, unidade_texto, aberto_em, sla_prazo, sla_violado, sla_violado_em, sla_horas_pausadas, sla_desvio_h,
              solucao, causa_raiz, motivo_cancelamento, fechado_em, tempo_resolucao_origem_h, escalado_em, csat_nota, csat_comentario, csat_respondido_em, tags,
              ultima_atualizacao_em, dado_teste, origem, origem_ref, criado_por, atualizado_por)
       select x.numero, x.sistema_origem, x.competencia, x.titulo, x.status, x.status_normalizado, x.tipo, x.prioridade, x.origem_canal, x.nivel_suporte, x.categoria, x.subcategoria,
              x.equipe, x.tecnico_responsavel, x.solicitante, x.departamento, x.unidade_texto, x.aberto_em, x.sla_prazo, x.sla_violado, x.sla_violado_em, x.sla_horas_pausadas, x.sla_desvio_h,
              x.solucao, x.causa_raiz, x.motivo_cancelamento, x.fechado_em, x.tempo_resolucao_origem_h, x.escalado_em, x.csat_nota, x.csat_comentario, x.csat_respondido_em,
              (select array_agg(t) from jsonb_array_elements_text(x.tags) t), x.ultima_atualizacao_em, x.dado_teste, 'IMPORTACAO', x.origem_ref, $2, $2
         from jsonb_to_recordset($1::jsonb) as x(numero text, sistema_origem text, competencia date, titulo text, status text, status_normalizado text, tipo text, prioridade text,
              origem_canal text, nivel_suporte text, categoria text, subcategoria text, equipe text, tecnico_responsavel text, solicitante text, departamento text, unidade_texto text,
              aberto_em timestamptz, sla_prazo timestamptz, sla_violado boolean, sla_violado_em timestamptz, sla_horas_pausadas numeric, sla_desvio_h numeric, solucao text,
              causa_raiz text, motivo_cancelamento text, fechado_em timestamptz, tempo_resolucao_origem_h numeric, escalado_em timestamptz, csat_nota numeric,
              csat_comentario text, csat_respondido_em timestamptz, tags jsonb, ultima_atualizacao_em timestamptz, dado_teste boolean, origem_ref jsonb)
       on conflict (sistema_origem, numero) where excluido_em is null do nothing
       returning id, sistema_origem, numero`,
      analise.chamadosTi.map((c) => ({
        numero: c.numero, sistema_origem: c.sistemaOrigem, competencia: c.competencia, titulo: c.titulo, status: c.status, status_normalizado: c.statusNormalizado,
        tipo: c.tipo, prioridade: c.prioridade, origem_canal: c.origemCanal, nivel_suporte: c.nivelSuporte, categoria: c.categoria, subcategoria: c.subcategoria,
        equipe: c.equipe, tecnico_responsavel: c.tecnicoResponsavel, solicitante: c.solicitante, departamento: c.departamento, unidade_texto: c.unidadeTexto,
        aberto_em: c.abertoEm, sla_prazo: c.slaPrazo, sla_violado: c.slaViolado, sla_violado_em: c.slaVioladoEm, sla_horas_pausadas: c.slaHorasPausadas, sla_desvio_h: c.slaDesvioH,
        solucao: c.solucao, causa_raiz: c.causaRaiz, motivo_cancelamento: c.motivoCancelamento, fechado_em: c.fechadoEm, tempo_resolucao_origem_h: c.tempoResolucaoOrigemH,
        escalado_em: c.escaladoEm, csat_nota: c.csatNota, csat_comentario: c.csatComentario, csat_respondido_em: c.csatRespondidoEm, tags: c.tags,
        ultima_atualizacao_em: c.ultimaAtualizacaoEm, dado_teste: c.dadoTeste, origem_ref: { ...origemBase, aba: c.aba, linha: c.linhaPlanilha },
      })),
      [usuarioId], 500)
    const idChamado = new Map(tiIns.map((r) => [`${r.sistema_origem}|${r.numero}`, Number(r.id)]))
    const restritos = analise.chamadosTi
      .filter((c) => idChamado.has(`${c.sistemaOrigem}|${c.numero}`) && Object.values(c.restrito).some((v) => v))
      .map((c) => ({
        chamado_id: idChamado.get(`${c.sistemaOrigem}|${c.numero}`), email_tecnico: c.restrito.emailTecnico, email_solicitante: c.restrito.emailSolicitante,
        ramal: c.restrito.ramal, ip_abertura: c.restrito.ipAbertura, fechado_por_email: c.restrito.fechadoPorEmail, escalado_por_email: c.restrito.escaladoPorEmail,
      }))
    await inserirLotes(db,
      `insert into chamado_ti_restrito (chamado_id, email_tecnico, email_solicitante, ramal, ip_abertura, fechado_por_email, escalado_por_email)
       select x.chamado_id, x.email_tecnico, x.email_solicitante, x.ramal, x.ip_abertura, x.fechado_por_email, x.escalado_por_email
         from jsonb_to_recordset($1::jsonb) as x(chamado_id int, email_tecnico text, email_solicitante text, ramal text, ip_abertura text, fechado_por_email text, escalado_por_email text)`,
      restritos)
    for (const c of analise.chamadosTi) {
      if (!idChamado.has(`${c.sistemaOrigem}|${c.numero}`)) {
        pendExtras.push({ aba: c.aba, celula: `A${c.linhaPlanilha}`, tipo: 'DUPLICIDADE', descricao: `Chamado ${c.numero} (${c.sistemaOrigem}) já existe no sistema: não gravado`, valorBruto: { numero: c.numero } })
      }
    }

    // 7) Pendências: propostas aceitas ficam resolvidas; novas pendências da gravação
    if (aplicadas.length) {
      await db.query(
        `update importacao_pendencia set resolvida = true, resolucao = 'Proposta de mapeamento aceita na gravação', resolvido_por = $2, resolvido_em = now()
          where importacao_id = $1 and tipo = 'SEM_MAPEAMENTO' and valor_bruto->>'proposta' = any($3::text[]) and not resolvida`,
        [importacaoId, usuarioId, aplicadas])
    }
    await inserirPendencias(db, importacaoId, pendExtras)

    await db.query(`update importacao set status = 'GRAVADA', gravado_por = $2, gravado_em = now(), resumo = $3 where id = $1`,
      [importacaoId, usuarioId, JSON.stringify({ ...resumoAnalise(analise), gravacao: { propostasAceitas: aplicadas, naoGravados: pendExtras.length } })])
    const reconciliacao = await relatorioReconciliacao(importacaoId, db)
    await db.query('update importacao set reconciliacao = $2 where id = $1', [importacaoId, JSON.stringify(reconciliacao)])
    return { reconciliacao, propostasAplicadas: aplicadas.length, naoGravados: pendExtras.length }
  })
}

/** Descarta a importação; se já gravada, remove todos os registros que ela criou. */
export async function descartarImportacao(importacaoId: number, usuarioId: string, motivo?: string) {
  return tx({ usuarioId, ignorarBloqueio: true, contexto: { importacao_id: importacaoId, acao: 'importacao.descartar', motivo: motivo ?? null } }, async (db) => {
    const imp = await travar(db, importacaoId)
    if (imp.status === 'DESCARTADA') throw new ErroImportacao('Importação já descartada.')
    if (imp.status !== 'ANALISADA' && !motivo?.trim()) throw new ErroImportacao('Informe o motivo para descartar uma importação já gravada.')
    const id = String(importacaoId)
    const removidos: Record<string, number> = {}
    removidos.historico_agregado = (await db.query('delete from historico_agregado where importacao_id = $1', [importacaoId])).rowCount ?? 0
    removidos.historico_detalhe = (await db.query('delete from historico_detalhe where importacao_id = $1', [importacaoId])).rowCount ?? 0
    for (const t of ['solicitacao_troca', 'comodato_posicao', 'chamado_ti']) {
      removidos[t] = (await db.query(`delete from ${t} where origem = 'IMPORTACAO' and origem_ref->>'importacao_id' = $1`, [id])).rowCount ?? 0
    }
    await db.query(
      `update importacao set status = 'DESCARTADA',
              resumo = coalesce(resumo, '{}'::jsonb) || jsonb_build_object('descarte', jsonb_build_object('motivo', $2::text, 'por', $3::text, 'em', now(), 'status_anterior', $4::text, 'removidos', $5::jsonb))
        where id = $1`,
      [importacaoId, motivo?.trim() || null, usuarioId, imp.status, JSON.stringify(removidos)])
    return { removidos }
  })
}

/** Pendências que impedem a homologação (bloqueantes sem resolução escrita). */
export async function pendenciasBloqueantes(importacaoId: number, db: Db = pool()) {
  return q<{ id: number; tipo: string; descricao: string }>(
    `select id, tipo, descricao from importacao_pendencia
      where importacao_id = $1 and tipo = any($2::text[]) and (not resolvida or coalesce(trim(resolucao), '') = '') order by id`,
    [importacaoId, PENDENCIAS_BLOQUEANTES], db)
}

export async function homologarImportacao(importacaoId: number, usuarioId: string, observacao: string) {
  if (!observacao?.trim()) throw new ErroImportacao('A observação da homologação é obrigatória.')
  return tx({ usuarioId, contexto: { importacao_id: importacaoId, acao: 'importacao.homologar' } }, async (db) => {
    const imp = await travar(db, importacaoId)
    if (imp.status !== 'GRAVADA') throw new ErroImportacao(`Somente importações GRAVADAS podem ser homologadas (atual: ${imp.status}).`)
    const bloq = await pendenciasBloqueantes(importacaoId, db)
    if (bloq.length) throw new ErroImportacao(`Há ${bloq.length} pendência(s) de total/conciliação sem resolução registrada. Resolva-as antes de homologar.`)
    await db.query(`update importacao set status = 'HOMOLOGADA', homologado_por = $2, homologado_em = now(), observacao_homologacao = $3 where id = $1`, [importacaoId, usuarioId, observacao.trim()])
  })
}

export async function resolverPendencia(id: number, usuarioId: string, resolucao: string, importacaoId?: number) {
  if (!resolucao?.trim()) throw new ErroImportacao('Descreva a resolução da pendência.')
  return tx({ usuarioId }, async (db) => {
    const p = await q1<{ importacao_id: number; status: string }>(
      `select p.importacao_id, i.status from importacao_pendencia p join importacao i on i.id = p.importacao_id where p.id = $1 for update of p`, [id], db)
    if (!p || (importacaoId !== undefined && p.importacao_id !== importacaoId)) throw new ErroImportacao('Pendência não encontrada.')
    if (p.status === 'HOMOLOGADA' || p.status === 'DESCARTADA') throw new ErroImportacao(`Importação ${p.status.toLowerCase()}: pendências não podem mais ser alteradas.`)
    await db.query(`update importacao_pendencia set resolvida = true, resolucao = $2, resolvido_por = $3, resolvido_em = now() where id = $1`, [id, resolucao.trim(), usuarioId])
    return { importacaoId: p.importacao_id }
  })
}
