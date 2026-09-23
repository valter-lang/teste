/**
 * Snapshot único do relatório: TODOS os geradores (Excel, PDF A4, PDF 16:9 e PowerPoint) leem
 * deste objeto, que por sua vez lê apenas do motor de indicadores (calcularPainel) e da camada
 * de séries (lerSerie) — os mesmos usados pelos painéis. Assim não há diferença silenciosa
 * entre dashboard e exportações.
 *
 * Privacidade: nunca inclui e-mails, telefones, IPs nem nomes de solicitantes (funcionários de
 * clientes). Técnicos podem virar iniciais conforme 'privacidade.anonimizar_nomes_diretoria'.
 */
import { createHash } from 'node:crypto'
import { q, q1, pool, type Db } from '@/lib/db'
import { rotuloEscopo, somarMeses, ultimoDia, type Escopo } from '@/lib/competencia'
import { calcularPainel, definicoesVigentes, type Definicao, type Resultado } from '@/lib/indicadores/motor'
import { descreverMeta } from '@/lib/indicadores/status'
import { lerSerie, pareto, dataCorteMigracao, type Dimensao, type SerieCodigo } from '@/lib/indicadores/series'
import { periodosDaCompetencia, situacaoConsolidada, ROTULO_STATUS } from '@/lib/fechamento'
import { competenciaCurta, competenciaLonga, competenciaArquivo, dataHora, data as fmtData, moeda, numero, valorIndicador, variacao, NAO_APLICAVEL } from '@/lib/format'
import { AREAS, nomeArea, pode, type AreaCodigo } from '@/lib/auth/permissoes'
import { REGRA_SEMAFORO, STATUS_REL, type FonteExportacao } from './estilo'
import { AREAS_DO_ESCOPO, GRUPOS_ISOLADOS, ROTULO_ESCOPO, ROTULO_MODO, iniciais, sanitizarTexto, secaoDoIndicador } from './nomes'
import type {
  AnaliseRelatorio, DadosRelatorio, DetalheTabela, EscopoRelatorio, FechamentoArea, IndicadorRelatorio, MetaProximoCiclo,
  ModoRelatorio, PlanoRelatorio, PontoEvolucao, Quebra, SecaoId, TabelaExtra, UsuarioRelatorio, ValorPeriodo,
} from './tipos'

export interface ParametrosRelatorio {
  competencia: string
  escopo: EscopoRelatorio
  modo: ModoRelatorio
  unidades?: number[] | null
  usuario: UsuarioRelatorio
  /** linhas de origem (somente Excel; filtradas pela permissão 'dados.ler' do usuário) */
  incluirDetalhes?: boolean
  db?: Db
}

const ESCOPOS: Escopo[] = ['MES', 'TRIMESTRE', 'SEMESTRE', 'ANO']

/* ------------------------------------------------------------------ formatação */

function textoValor(v: number | null, situacao: string, unidade: string, casas: number): string {
  if (v === null) return situacao === 'NAO_APLICAVEL' ? NAO_APLICAVEL : valorIndicador(null, unidade, casas)
  return valorIndicador(v, unidade, casas)
}

function textoVariacao(r: Resultado): string {
  if (r.variacaoAbs === null) return 'Sem comparação'
  if (r.unidade === '%') return `${variacao(r.variacaoAbs, r.casas)} p.p.`
  const abs = r.unidade === 'R$'
    ? `${r.variacaoAbs > 0 ? '+' : r.variacaoAbs < 0 ? '−' : ''}${moeda(Math.abs(r.variacaoAbs))}`
    : variacao(r.variacaoAbs, r.unidade === 'qtd' ? 0 : r.casas)
  return r.variacaoPct !== null ? `${abs} (${variacao(r.variacaoPct, 1)}%)` : abs
}

function valorPeriodo(r: Resultado): ValorPeriodo {
  return {
    escopo: r.escopo,
    rotulo: rotuloEscopo(`${r.periodoFim.slice(0, 7)}-01`, r.escopo),
    periodoInicio: r.periodoInicio,
    periodoFim: r.periodoFim,
    valor: r.valor,
    texto: textoValor(r.valor, r.situacao, r.unidade, r.casas),
    numerador: r.numerador,
    denominador: r.denominador,
    alvo: r.alvo,
    metaTexto: r.metaDescricao ?? 'Sem meta homologada',
    status: r.status,
    statusTexto: `${STATUS_REL[r.status].simbolo} ${STATUS_REL[r.status].texto}`,
    valorAnterior: r.valorAnterior,
    anteriorTexto: r.valorAnterior === null ? 'Não informado' : valorIndicador(r.valorAnterior, r.unidade, r.casas),
    variacaoAbs: r.variacaoAbs,
    variacaoPct: r.variacaoPct,
    variacaoTexto: textoVariacao(r),
    situacao: r.situacao,
    motivo: r.motivo,
    fonte: r.fonte,
    regra: r.memoria.regra,
    calculadoEm: r.calculadoEm,
  }
}

function tendencia(ev: PontoEvolucao[], direcao: Definicao['direcao']): Pick<IndicadorRelatorio, 'tendencia' | 'tendenciaTexto'> {
  const vals = ev.filter((p) => p.valor !== null).map((p) => p.valor as number).slice(-3)
  if (vals.length < 2) return { tendencia: 'SEM_DADOS', tendenciaTexto: 'Sem histórico suficiente' }
  const ult = vals[vals.length - 1]
  const ant = vals.slice(0, -1)
  const media = ant.reduce((s, v) => s + v, 0) / ant.length
  const rel = Math.abs(ult - media) / Math.max(Math.abs(media), 1e-9)
  if (rel < 0.02) return { tendencia: 'ESTAVEL', tendenciaTexto: '→ Estável' }
  const alta = ult > media
  const fav = direcao === 'MAIOR_MELHOR' ? alta : direcao === 'MENOR_MELHOR' ? !alta : null
  const sufixo = fav === null ? '' : fav ? ' (favorável)' : ' (desfavorável)'
  return alta ? { tendencia: 'ALTA', tendenciaTexto: `↗ Em alta${sufixo}` } : { tendencia: 'QUEDA', tendenciaTexto: `↘ Em queda${sufixo}` }
}

/* ------------------------------------------------------------------ quebras (séries) */

interface DefQuebra { id: string; secao: SecaoId; titulo: string; serie: SerieCodigo; dimensao: Dimensao; rotuloDim: string; tipo: Quebra['tipo']; executivo: boolean }

export const QUEBRAS: DefQuebra[] = [
  { id: 'MI_RECUPERADOS_FAMILIA', secao: 'MANUT_INTERNA', titulo: 'Recuperações por família de equipamento', serie: 'MI_RECUPERADOS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: true },
  { id: 'MI_SUCATEADOS_FAMILIA', secao: 'MANUT_INTERNA', titulo: 'Equipamentos sucateados por família', serie: 'MI_SUCATEADOS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: true },
  { id: 'MI_RECUPERADOS_TECNICO', secao: 'MANUT_INTERNA', titulo: 'Recuperações por técnico', serie: 'MI_RECUPERADOS', dimensao: 'TECNICO', rotuloDim: 'Técnico', tipo: 'COMPARATIVO', executivo: false },
  { id: 'MI_LAVAGENS_FAMILIA', secao: 'MANUT_INTERNA', titulo: 'Lavagens/higienizações por família', serie: 'MI_LAVAGENS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: false },
  { id: 'ME_ATENDIMENTOS_TECNICO', secao: 'MANUT_EXTERNA', titulo: 'Atendimentos externos por técnico', serie: 'ME_ATENDIMENTOS', dimensao: 'TECNICO', rotuloDim: 'Técnico', tipo: 'COMPARATIVO', executivo: true },
  { id: 'ME_CHAMADOS_FAMILIA', secao: 'MANUT_EXTERNA', titulo: 'Chamados externos por família de equipamento', serie: 'ME_CHAMADOS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: true },
  { id: 'ME_CHAMADOS_CLIENTE', secao: 'MANUT_EXTERNA', titulo: 'Clientes com mais chamados (Pareto do mês)', serie: 'ME_CHAMADOS', dimensao: 'CLIENTE', rotuloDim: 'Cliente', tipo: 'PARETO', executivo: false },
  { id: 'ME_REINCIDENCIAS_TECNICO', secao: 'MANUT_EXTERNA', titulo: 'Reincidências por técnico do atendimento anterior', serie: 'ME_REINCIDENCIAS', dimensao: 'TECNICO', rotuloDim: 'Técnico', tipo: 'COMPARATIVO', executivo: false },
  { id: 'ME_DESNECESSARIOS_MOTIVO', secao: 'MANUT_EXTERNA', titulo: 'Chamados desnecessários por motivo', serie: 'ME_DESNECESSARIOS', dimensao: 'MOTIVO', rotuloDim: 'Motivo', tipo: 'COMPARATIVO', executivo: true },
  { id: 'EP_SAIDA_FAMILIA', secao: 'ESTOQUE_PECAS', titulo: 'Saídas de estoque por família de peça (R$)', serie: 'EP_SAIDA_RS', dimensao: 'FAMILIA_PECA', rotuloDim: 'Família de peça', tipo: 'COMPARATIVO', executivo: true },
  { id: 'EP_PECAS_INTERNAS', secao: 'ESTOQUE_PECAS', titulo: 'Peças utilizadas na oficina por família', serie: 'MI_PECAS_QTD', dimensao: 'FAMILIA_PECA', rotuloDim: 'Família de peça', tipo: 'COMPARATIVO', executivo: false },
  { id: 'EP_PECAS_EXTERNAS', secao: 'ESTOQUE_PECAS', titulo: 'Peças utilizadas em campo por família', serie: 'ME_PECAS_QTD', dimensao: 'FAMILIA_PECA', rotuloDim: 'Família de peça', tipo: 'COMPARATIVO', executivo: false },
  { id: 'CO_ENTREGAS_FAMILIA', secao: 'COMODATO_BASE', titulo: 'Entregas de comodato por família', serie: 'CO_ENTREGAS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: true },
  { id: 'CO_RETIRADAS_FAMILIA', secao: 'COMODATO_BASE', titulo: 'Retiradas de comodato por família', serie: 'CO_RETIRADAS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: false },
  { id: 'CO_TROCAS_FAMILIA', secao: 'COMODATO_ATENDIMENTO', titulo: 'Trocas de comodato por família', serie: 'CO_TROCAS', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: true },
  { id: 'ME_TROCAS_FAMILIA', secao: 'COMODATO_ATENDIMENTO', titulo: 'Trocas solicitadas pela manutenção por família', serie: 'ME_TROCAS_QTD', dimensao: 'FAMILIA_EQUIP', rotuloDim: 'Família', tipo: 'COMPARATIVO', executivo: false },
  { id: 'TI_ABERTOS_CATEGORIA', secao: 'TI_OPERACAO', titulo: 'Chamados de TI por categoria', serie: 'TI_ABERTOS', dimensao: 'CATEGORIA', rotuloDim: 'Categoria', tipo: 'COMPARATIVO', executivo: true },
  { id: 'TI_ABERTOS_STATUS', secao: 'TI_OPERACAO', titulo: 'Situação dos chamados de TI abertos no mês', serie: 'TI_ABERTOS', dimensao: 'STATUS', rotuloDim: 'Situação', tipo: 'COMPARATIVO', executivo: false },
  { id: 'TI_RESOLVIDOS_PRIORIDADE', secao: 'TI_OPERACAO', titulo: 'Chamados de TI resolvidos por prioridade', serie: 'TI_RESOLVIDOS', dimensao: 'PRIORIDADE', rotuloDim: 'Prioridade', tipo: 'COMPARATIVO', executivo: false },
  { id: 'TI_ABERTOS_ORIGEM', secao: 'TI_OPERACAO', titulo: 'Chamados de TI por sistema de origem', serie: 'TI_ABERTOS', dimensao: 'SISTEMA_ORIGEM', rotuloDim: 'Origem', tipo: 'COMPARATIVO', executivo: false },
]

const MAX_ITENS_QUEBRA = 8
const MOTIVOS: Record<string, string> = {
  ELETRICA_CLIENTE: 'Elétrica do cliente', SEM_DEFEITO: 'Sem defeito', INFRAESTRUTURA_CLIENTE: 'Infraestrutura do cliente',
  DESLIGADO: 'Equipamento desligado', OPERACAO_INCORRETA: 'Operação incorreta', OUTRO: 'Outro',
}

async function montarQuebra(def: DefQuebra, comp: string, anonimizar: boolean, db: Db): Promise<Quebra | null> {
  const meses = [somarMeses(comp, -2), somarMeses(comp, -1), comp]
  const r = await lerSerie(def.serie, meses, def.dimensao, db)
  const nomeDim = (d: string) => (anonimizar && def.dimensao === 'TECNICO' && d !== 'Não informado' ? iniciais(d) : def.dimensao === 'MOTIVO' ? MOTIVOS[d] ?? d : d)
  const mapa = new Map<string, number[]>()
  for (const p of r.pontos) {
    if (p.dimensao === null) continue
    const k = nomeDim(p.dimensao)
    const arr = mapa.get(k) ?? [0, 0, 0]
    arr[meses.indexOf(p.competencia)] += p.valor
    mapa.set(k, arr)
  }
  if (!mapa.size) return null
  const ordenados = [...mapa.entries()].map(([dimensao, valores]) => ({ dimensao, valores }))
    .sort((a, b) => b.valores[2] - a.valores[2] || b.valores.reduce((s, v) => s + v, 0) - a.valores.reduce((s, v) => s + v, 0) || a.dimensao.localeCompare(b.dimensao))
  let itens = ordenados
  if (ordenados.length > MAX_ITENS_QUEBRA) {
    const resto = ordenados.slice(MAX_ITENS_QUEBRA - 1)
    itens = [...ordenados.slice(0, MAX_ITENS_QUEBRA - 1), { dimensao: `Demais (${resto.length})`, valores: [0, 1, 2].map((i) => resto.reduce((s, x) => s + x.valores[i], 0)) }]
  }
  const par = pareto(itens.map((i) => ({ dimensao: i.dimensao, valor: i.valores[2] })))
  const totais = meses.map((m) => r.porMes[m]?.valor ?? null)
  const fmt = (v: number | null) => (v === null ? 'Não informado' : def.serie.endsWith('_RS') ? moeda(v) : numero(v, 0))
  const fontes = [...new Set(meses.map((m) => r.porMes[m]?.fonte).filter(Boolean))]
  return {
    id: def.id, secao: def.secao, titulo: def.titulo, serie: def.serie, dimensao: def.dimensao, dimensaoRotulo: def.rotuloDim,
    unidade: def.serie.endsWith('_RS') ? 'R$' : 'qtd', tipo: def.tipo, meses, rotulosMeses: meses.map(competenciaCurta),
    totais, totaisTexto: totais.map(fmt),
    itens: itens.map((i, k) => ({ dimensao: i.dimensao, valores: i.valores, atual: i.valores[2], participacao: par[k].participacao, acumulado: par[k].acumulado, classeA: par[k].classeA })),
    fonte: fontes.map((f) => (f === 'HISTORICO' ? 'histórico migrado da planilha' : 'lançamentos do sistema')).join(' + ') || 'lançamentos do sistema',
  }
}

/* ------------------------------------------------------------------ análises, planos, metas */

const ROTULO_ANALISE: Record<AnaliseRelatorio['tipo'], string> = {
  DESTAQUE: 'Destaque', ATENCAO: 'Ponto de atenção', RISCO: 'Risco', DEPENDENCIA: 'Dependência',
  EXPLICACAO_DESVIO: 'Explicação de desvio', DECISAO_SOLICITADA: 'Decisão solicitada',
}
const ROTULO_PLANO: Record<string, string> = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_EFICACIA: 'Aguardando eficácia', ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada',
}
const ROTULO_CICLO: Record<string, string> = { MENSAL: 'Mensal', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual' }

function fmtNum(v: number, casas = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v)
}

export function descreverMetaCiclo(m: { tipo: string; operador: '>=' | '<=' | '=' | 'ENTRE'; valor: number | null; valor_max: number | null; linha_base: number | null; ciclo: string; tolerancia_pct: number }, unidade: string, casas: number): string {
  if (m.valor === null) return 'Valor pendente de homologação'
  const op = m.operador === '>=' ? '≥' : m.operador === '<=' ? '≤' : m.operador === '=' ? '=' : 'entre'
  switch (m.tipo) {
    case 'ABSOLUTA':
    case 'CONTAGEM_MINIMA':
      return descreverMeta({ operador: m.operador, alvo: m.valor, alvoMax: m.valor_max, toleranciaPct: m.tolerancia_pct }, unidade, casas)
    case 'LINHA_BASE_MAIS':
      return `${op} linha de base ${m.valor >= 0 ? '+' : ''}${fmtNum(m.valor)}${m.ciclo === 'MENSAL' ? ' por mês' : ' no ciclo'}${m.linha_base === null ? ' (linha de base pendente)' : ` (base ${fmtNum(m.linha_base)})`}`
    case 'PERCENTUAL_SOBRE_LINHA_BASE':
      return `${op} linha de base ${m.valor >= 0 ? '+' : ''}${fmtNum(m.valor)}%${m.linha_base === null ? ' (linha de base pendente)' : ''}`
    case 'VARIACAO_PERIODO_ANTERIOR':
      return `${m.valor >= 0 ? '+' : '−'}${fmtNum(Math.abs(m.valor))}% vs período anterior`
    case 'TENDENCIA_QUEDA':
      return 'Tendência de queda no ciclo'
    default:
      return `${op} ${fmtNum(m.valor)}`
  }
}

/* ------------------------------------------------------------------ detalhes (Excel) */

async function montarDetalhes(p: { comp: string; areas: AreaCodigo[]; unidades: number[] | null; usuario: UsuarioRelatorio; anonimizar: boolean; historico: boolean; db: Db }): Promise<DetalheTabela[]> {
  const { comp, unidades, db } = p
  const pode_ = (a: AreaCodigo) => p.areas.includes(a) && pode(p.usuario, 'dados.ler', a)
  const tec = (n: string | null) => (n && p.anonimizar ? iniciais(n) : n)
  const out: DetalheTabela[] = []
  const u = unidades && unidades.length ? unidades : null
  if (pode_('MANUT_INTERNA')) {
    const rows = await q(`select m.id, m.data_recebimento, m.data_conclusao, un.nome as unidade, fe.nome as familia, mo.nome as modelo, m.identificador,
        m.tipo_servico, m.resultado, tc.nome as tecnico, m.motivo_sucateamento, m.custo_mao_obra, m.observacao, m.origem
       from manut_interna m join familia_equipamento fe on fe.id = m.familia_id left join modelo_equipamento mo on mo.id = m.modelo_id
       left join tecnico tc on tc.id = m.tecnico_id left join unidade un on un.id = m.unidade_id
      where m.competencia = $1 and m.excluido_em is null and ($2::int[] is null or m.unidade_id = any($2)) order by m.id`, [comp, u], db)
    out.push({ aba: 'Dados - Manut. interna', area: 'MANUT_INTERNA', titulo: 'Manutenção interna — lançamentos da competência', colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro', largura: 8 }, { chave: 'data_recebimento', titulo: 'Recebimento', tipo: 'data' },
      { chave: 'data_conclusao', titulo: 'Conclusão', tipo: 'data' }, { chave: 'unidade', titulo: 'Unidade', tipo: 'texto' },
      { chave: 'familia', titulo: 'Família', tipo: 'texto' }, { chave: 'modelo', titulo: 'Modelo', tipo: 'texto' },
      { chave: 'identificador', titulo: 'Identificador', tipo: 'texto' }, { chave: 'tipo_servico', titulo: 'Serviço', tipo: 'texto' },
      { chave: 'resultado', titulo: 'Resultado', tipo: 'texto' }, { chave: 'tecnico', titulo: 'Técnico', tipo: 'texto' },
      { chave: 'motivo_sucateamento', titulo: 'Motivo do sucateamento', tipo: 'texto', largura: 30 },
      { chave: 'custo_mao_obra', titulo: 'Custo mão de obra', tipo: 'moeda' }, { chave: 'observacao', titulo: 'Observação', tipo: 'texto', largura: 40 },
      { chave: 'origem', titulo: 'Origem', tipo: 'texto' },
    ], linhas: rows.map((r) => ({ ...r, tecnico: tec(r.tecnico), motivo_sucateamento: sanitizarTexto(r.motivo_sucateamento), observacao: sanitizarTexto(r.observacao) })) })
  }
  if (pode_('MANUT_EXTERNA')) {
    const rows = await q(`select c.numero, c.aberto_em, c.primeira_resposta_em, c.atendido_em, c.encerrado_em, cl.fantasia as cliente, rd.nome as rede,
        fe.nome as familia, c.identificador, c.equipamento_do_cliente, tc.nome as tecnico, c.tipo_atendimento, c.status, c.necessario,
        c.motivo_desnecessario, c.resolvido_primeira_visita, ant.numero as chamado_anterior, c.equipamento_parado, c.criticidade,
        c.elegivel_sla, c.valor_cobrado, c.causa, c.solucao
       from chamado_externo c left join cliente cl on cl.id = c.cliente_id left join rede rd on rd.id = cl.rede_id
       left join familia_equipamento fe on fe.id = c.familia_id left join tecnico tc on tc.id = c.tecnico_id
       left join chamado_externo ant on ant.id = c.chamado_anterior_id
      where c.competencia = $1 and c.excluido_em is null and ($2::int[] is null or c.unidade_id = any($2)) order by c.aberto_em, c.numero`, [comp, u], db)
    out.push({ aba: 'Dados - Chamados externos', area: 'MANUT_EXTERNA', titulo: 'Chamados externos da competência (sem dados do solicitante)', colunas: [
      { chave: 'numero', titulo: 'Chamado', tipo: 'texto' }, { chave: 'aberto_em', titulo: 'Abertura', tipo: 'dataHora' },
      { chave: 'primeira_resposta_em', titulo: '1ª resposta', tipo: 'dataHora' }, { chave: 'atendido_em', titulo: 'Atendimento', tipo: 'dataHora' },
      { chave: 'encerrado_em', titulo: 'Encerramento', tipo: 'dataHora' }, { chave: 'cliente', titulo: 'Cliente (fantasia)', tipo: 'texto', largura: 26 },
      { chave: 'rede', titulo: 'Rede', tipo: 'texto' }, { chave: 'familia', titulo: 'Família', tipo: 'texto' },
      { chave: 'identificador', titulo: 'Identificador', tipo: 'texto' }, { chave: 'equipamento_do_cliente', titulo: 'Equip. do cliente', tipo: 'booleano' },
      { chave: 'tecnico', titulo: 'Técnico', tipo: 'texto' }, { chave: 'tipo_atendimento', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'status', titulo: 'Situação', tipo: 'texto' }, { chave: 'necessario', titulo: 'Necessário', tipo: 'booleano' },
      { chave: 'motivo_desnecessario', titulo: 'Motivo (desnecessário)', tipo: 'texto' }, { chave: 'resolvido_primeira_visita', titulo: 'Resolvido 1ª visita', tipo: 'booleano' },
      { chave: 'chamado_anterior', titulo: 'Reincidência de', tipo: 'texto' }, { chave: 'equipamento_parado', titulo: 'Equip. parado', tipo: 'booleano' },
      { chave: 'criticidade', titulo: 'Criticidade', tipo: 'texto' }, { chave: 'elegivel_sla', titulo: 'Elegível SLA', tipo: 'booleano' },
      { chave: 'valor_cobrado', titulo: 'Valor cobrado', tipo: 'moeda' }, { chave: 'causa', titulo: 'Causa', tipo: 'texto', largura: 30 },
      { chave: 'solucao', titulo: 'Solução', tipo: 'texto', largura: 30 },
    ], linhas: rows.map((r) => ({ ...r, tecnico: tec(r.tecnico), causa: sanitizarTexto(r.causa), solucao: sanitizarTexto(r.solucao) })) })
    const trocas = await q(`select s.data_solicitacao, s.data_troca, coalesce(cl.fantasia, s.cliente_texto) as cliente, fe.nome as familia, s.equipamento_texto,
        s.linha, s.causa, s.status, tc.nome as tecnico
       from solicitacao_troca s left join cliente cl on cl.id = s.cliente_id left join familia_equipamento fe on fe.id = s.familia_id
       left join tecnico tc on tc.id = s.solicitado_por_tecnico_id
      where s.competencia = $1 and s.excluido_em is null order by s.data_solicitacao, s.id`, [comp], db)
    out.push({ aba: 'Dados - Trocas', area: 'MANUT_EXTERNA', titulo: 'Solicitações de troca da competência', colunas: [
      { chave: 'data_solicitacao', titulo: 'Solicitação', tipo: 'data' }, { chave: 'data_troca', titulo: 'Troca', tipo: 'data' },
      { chave: 'cliente', titulo: 'Cliente', tipo: 'texto', largura: 26 }, { chave: 'familia', titulo: 'Família', tipo: 'texto' },
      { chave: 'equipamento_texto', titulo: 'Equipamento', tipo: 'texto' }, { chave: 'linha', titulo: 'Linha', tipo: 'texto' },
      { chave: 'causa', titulo: 'Causa', tipo: 'texto', largura: 30 }, { chave: 'status', titulo: 'Situação', tipo: 'texto' },
      { chave: 'tecnico', titulo: 'Técnico solicitante', tipo: 'texto' },
    ], linhas: trocas.map((r) => ({ ...r, tecnico: tec(r.tecnico), causa: sanitizarTexto(r.causa), equipamento_texto: sanitizarTexto(r.equipamento_texto) })) })
  }
  if (pode_('ESTOQUE_PECAS')) {
    const rows = await q(`select m.data, m.tipo, fp.nome as familia, ip.codigo as item_codigo, ip.descricao as item, m.quantidade, m.valor_total,
        le.nome as local, m.aplicacao, m.motivo, m.documento_origem
       from movimento_estoque m join familia_peca fp on fp.id = m.familia_id left join item_peca ip on ip.id = m.item_peca_id
       left join local_estoque le on le.id = m.local_estoque_id
      where m.competencia = $1 and m.excluido_em is null order by m.data, m.id`, [comp], db)
    out.push({ aba: 'Dados - Estoque de pecas', area: 'ESTOQUE_PECAS', titulo: 'Movimentos de estoque de peças da competência', colunas: [
      { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'tipo', titulo: 'Tipo', tipo: 'texto' }, { chave: 'familia', titulo: 'Família de peça', tipo: 'texto' },
      { chave: 'item_codigo', titulo: 'Código', tipo: 'texto' }, { chave: 'item', titulo: 'Item', tipo: 'texto', largura: 30 },
      { chave: 'quantidade', titulo: 'Quantidade', tipo: 'decimal' }, { chave: 'valor_total', titulo: 'Valor total', tipo: 'moeda' },
      { chave: 'local', titulo: 'Local', tipo: 'texto' }, { chave: 'aplicacao', titulo: 'Aplicação', tipo: 'texto' },
      { chave: 'motivo', titulo: 'Motivo', tipo: 'texto', largura: 30 }, { chave: 'documento_origem', titulo: 'Documento', tipo: 'texto' },
    ], linhas: rows.map((r) => ({ ...r, motivo: sanitizarTexto(r.motivo) })) })
  }
  if (pode_('COMODATO')) {
    const rows = await q(`select m.solicitacao_numero, m.tipo, coalesce(cl.fantasia, m.cliente_texto) as cliente, fe.nome as familia, m.campanha_fim_ano,
        m.data_solicitacao, m.data_agendamento, m.data_conclusao, m.situacao, m.motivo_insucesso
       from comodato_movimento m left join cliente cl on cl.id = m.cliente_id left join familia_equipamento fe on fe.id = m.familia_id
      where m.competencia = $1 and m.excluido_em is null order by m.data_solicitacao, m.id`, [comp], db)
    out.push({ aba: 'Dados - Mov. comodato', area: 'COMODATO', titulo: 'Movimentos de comodato da competência', colunas: [
      { chave: 'solicitacao_numero', titulo: 'Solicitação', tipo: 'texto' }, { chave: 'tipo', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'cliente', titulo: 'Cliente', tipo: 'texto', largura: 26 }, { chave: 'familia', titulo: 'Família', tipo: 'texto' },
      { chave: 'campanha_fim_ano', titulo: 'Campanha fim de ano', tipo: 'booleano' }, { chave: 'data_solicitacao', titulo: 'Solicitada em', tipo: 'data' },
      { chave: 'data_agendamento', titulo: 'Agendada para', tipo: 'data' }, { chave: 'data_conclusao', titulo: 'Concluída em', tipo: 'data' },
      { chave: 'situacao', titulo: 'Situação', tipo: 'texto' }, { chave: 'motivo_insucesso', titulo: 'Motivo do insucesso', tipo: 'texto', largura: 30 },
    ], linhas: rows.map((r) => ({ ...r, motivo_insucesso: sanitizarTexto(r.motivo_insucesso) })) })
    const pos = await q(`select p.produto, fe.nome as familia, p.posicao_anterior, p.entradas, p.saidas_novos, p.saidas_usados, p.novos, p.usados,
        p.manutencao_interna, p.sucata, p.custo_total_novos, p.custo_total_usados, p.ajuste, p.justificativa_ajuste
       from comodato_posicao p left join familia_equipamento fe on fe.id = p.familia_id
      where p.competencia = $1 and p.excluido_em is null and ($2::int[] is null or p.unidade_id = any($2)) order by p.produto`, [comp, u], db)
    out.push({ aba: 'Dados - Posicao comodato', area: 'COMODATO', titulo: 'Posição do estoque de comodato no fim da competência', colunas: [
      { chave: 'produto', titulo: 'Produto', tipo: 'texto', largura: 26 }, { chave: 'familia', titulo: 'Família', tipo: 'texto' },
      { chave: 'posicao_anterior', titulo: 'Posição anterior', tipo: 'inteiro' }, { chave: 'entradas', titulo: 'Entradas', tipo: 'inteiro' },
      { chave: 'saidas_novos', titulo: 'Saídas (novos)', tipo: 'inteiro' }, { chave: 'saidas_usados', titulo: 'Saídas (usados)', tipo: 'inteiro' },
      { chave: 'novos', titulo: 'Novos', tipo: 'inteiro' }, { chave: 'usados', titulo: 'Usados', tipo: 'inteiro' },
      { chave: 'manutencao_interna', titulo: 'Em manutenção', tipo: 'inteiro' }, { chave: 'sucata', titulo: 'Sucata', tipo: 'inteiro' },
      { chave: 'custo_total_novos', titulo: 'Custo novos', tipo: 'moeda' }, { chave: 'custo_total_usados', titulo: 'Custo usados', tipo: 'moeda' },
      { chave: 'ajuste', titulo: 'Ajuste', tipo: 'inteiro' }, { chave: 'justificativa_ajuste', titulo: 'Justificativa do ajuste', tipo: 'texto', largura: 30 },
    ], linhas: pos.map((r) => ({ ...r, justificativa_ajuste: sanitizarTexto(r.justificativa_ajuste) })) })
  }
  if (pode_('TI')) {
    // Nenhum campo de contato (solicitante, e-mails, ramal, IP) é lido.
    const rows = await q(`select t.numero, t.sistema_origem, t.titulo, t.status, t.status_normalizado, t.tipo, t.prioridade, t.origem_canal, t.nivel_suporte,
        t.categoria, t.subcategoria, t.equipe, t.tecnico_responsavel, t.departamento, t.aberto_em, t.sla_prazo, t.sla_violado, t.fechado_em,
        t.tempo_resolucao_origem_h, t.csat_nota, t.resolvido_primeiro_contato, t.elegivel_sla
       from chamado_ti t where t.competencia = $1 and t.excluido_em is null and not t.dado_teste order by t.aberto_em, t.numero`, [comp], db)
    out.push({ aba: 'Dados - Chamados TI', area: 'TI', titulo: 'Chamados de TI da competência (sem dados de contato)', colunas: [
      { chave: 'numero', titulo: 'Chamado', tipo: 'texto' }, { chave: 'sistema_origem', titulo: 'Sistema', tipo: 'texto' },
      { chave: 'titulo', titulo: 'Título', tipo: 'texto', largura: 36 }, { chave: 'status', titulo: 'Status (origem)', tipo: 'texto' },
      { chave: 'status_normalizado', titulo: 'Status', tipo: 'texto' }, { chave: 'tipo', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'prioridade', titulo: 'Prioridade', tipo: 'texto' }, { chave: 'origem_canal', titulo: 'Canal', tipo: 'texto' },
      { chave: 'nivel_suporte', titulo: 'Nível', tipo: 'texto' }, { chave: 'categoria', titulo: 'Categoria', tipo: 'texto' },
      { chave: 'subcategoria', titulo: 'Subcategoria', tipo: 'texto' }, { chave: 'equipe', titulo: 'Equipe', tipo: 'texto' },
      { chave: 'tecnico_responsavel', titulo: 'Técnico', tipo: 'texto' }, { chave: 'departamento', titulo: 'Departamento', tipo: 'texto' },
      { chave: 'aberto_em', titulo: 'Abertura', tipo: 'dataHora' }, { chave: 'sla_prazo', titulo: 'Prazo SLA', tipo: 'dataHora' },
      { chave: 'sla_violado', titulo: 'SLA violado', tipo: 'booleano' }, { chave: 'fechado_em', titulo: 'Fechamento', tipo: 'dataHora' },
      { chave: 'tempo_resolucao_origem_h', titulo: 'Tempo resolução (h)', tipo: 'decimal' }, { chave: 'csat_nota', titulo: 'CSAT', tipo: 'decimal' },
      { chave: 'resolvido_primeiro_contato', titulo: '1º contato', tipo: 'booleano' }, { chave: 'elegivel_sla', titulo: 'Elegível SLA', tipo: 'booleano' },
    ], linhas: rows.map((r) => ({ ...r, titulo: sanitizarTexto(r.titulo), tecnico_responsavel: tec(r.tecnico_responsavel) })) })
  }
  if (p.historico) {
    const areasHist = p.areas.filter((a) => pode(p.usuario, 'dados.ler', a))
    const rows = await q<{ area_codigo: string; serie: string; dimensao_tipo: string | null; dimensao_valor: string | null; valor: number; aba: string; celula: string }>(
      `select area_codigo, serie, dimensao_tipo, dimensao_valor, valor, aba, celula from historico_agregado
        where competencia = $1 and area_codigo = any($2) order by area_codigo, serie, dimensao_tipo nulls first, dimensao_valor`, [comp, areasHist], db)
    if (rows.length) {
      out.push({ aba: 'Dados - Historico migrado', area: areasHist[0] ?? 'MANUT_INTERNA', titulo: 'Histórico migrado da planilha (competência anterior à data de corte)', colunas: [
        { chave: 'area', titulo: 'Área', tipo: 'texto' }, { chave: 'serie', titulo: 'Série', tipo: 'texto' },
        { chave: 'dimensao_tipo', titulo: 'Dimensão', tipo: 'texto' }, { chave: 'dimensao_valor', titulo: 'Item', tipo: 'texto', largura: 26 },
        { chave: 'valor', titulo: 'Valor', tipo: 'decimal' }, { chave: 'aba', titulo: 'Aba de origem', tipo: 'texto' }, { chave: 'celula', titulo: 'Célula', tipo: 'texto' },
      ], linhas: rows.map((r) => ({ area: nomeArea(r.area_codigo), serie: r.serie, dimensao_tipo: r.dimensao_tipo,
        dimensao_valor: r.dimensao_tipo === 'TECNICO' && r.dimensao_valor && p.anonimizar ? iniciais(r.dimensao_valor) : r.dimensao_valor,
        valor: r.valor, aba: r.aba, celula: r.celula })) })
    }
  }
  return out
}

/* ------------------------------------------------------------------ hash */

/** sha256 dos dados (sem carimbos de hora, usuário e versão): mesmos dados => mesmo hash. */
export function hashDados(d: Omit<DadosRelatorio, 'hash'>): string {
  const ignorar = new Set(['calculadoEm', 'geradoEm', 'geradoEmTexto', 'usuario', 'versao', 'logotipo'])
  const json = JSON.stringify(d, (k, v) => (ignorar.has(k) ? undefined : v))
  return createHash('sha256').update(json).digest('hex')
}

/* ------------------------------------------------------------------ montagem */

export async function montarDadosRelatorio(p: ParametrosRelatorio): Promise<DadosRelatorio> {
  const db = p.db ?? pool()
  const comp = p.competencia
  const areas = AREAS_DO_ESCOPO[p.escopo]
  const cfg = Object.fromEntries((await q<{ chave: string; valor: unknown }>(
    `select chave, valor from configuracao where chave in ('relatorio.fonte_exportacao','privacidade.anonimizar_nomes_diretoria','identidade.logotipo')`, [], db))
    .map((r) => [r.chave, r.valor]))
  const fonteExportacao: FonteExportacao = cfg['relatorio.fonte_exportacao'] === 'SEGURA' ? 'SEGURA' : 'OFICIAL'
  const anonimizar = cfg['privacidade.anonimizar_nomes_diretoria'] === true
  let logotipo: DadosRelatorio['metadados']['logotipo'] = null
  const logoId = (cfg['identidade.logotipo'] as { arquivo_id?: string } | undefined)?.arquivo_id
  if (logoId) {
    const a = await q1<{ mime: string; conteudo: Buffer }>(`select mime, conteudo from arquivo where id = $1`, [logoId], db)
    if (a && /^image\/(png|jpeg|svg\+xml)$/.test(a.mime)) logotipo = { mime: a.mime, base64: Buffer.from(a.conteudo).toString('base64') }
  }

  // Indicadores do relatório
  const defs = (await definicoesVigentes(db)).filter((d) => areas.includes(d.area_codigo as AreaCodigo))
  const classes: Definicao['classe'][] = p.modo === 'COMPLETO' ? ['ESSENCIAL', 'COMPLEMENTAR', 'OPERACIONAL'] : ['ESSENCIAL']
  const obrigatorios = new Set(p.escopo === 'CONSOLIDADO' ? [] : GRUPOS_ISOLADOS[p.escopo].flatMap((g) => g.codigos))
  const selecionadas = defs.filter((d) => classes.includes(d.classe) || obrigatorios.has(d.codigo))
  const codigos = selecionadas.map((d) => d.codigo)
  const porEscopo = {} as Record<Escopo, Map<string, Resultado>>
  for (const e of ESCOPOS) {
    const res = codigos.length ? await calcularPainel(comp, e, { codigos }, { db, usuarioId: p.usuario.id }) : []
    porEscopo[e] = new Map(res.map((r) => [r.codigo, r]))
  }

  // Análises da competência
  const analisesRows = await q<{ id: number; area_codigo: AreaCodigo; tipo: AnaliseRelatorio['tipo']; fato: string; numero: string | null; indicador_codigo: string | null; ocorrencia: string | null; responsavel: string; area_dependente: string | null }>(
    `select a.id, a.area_codigo, a.tipo, a.fato, a.numero, a.indicador_codigo, a.ocorrencia, a.responsavel, a.area_dependente
       from analise_item a join area ar on ar.codigo = a.area_codigo
      where a.competencia = $1 and a.excluido_em is null and a.area_codigo = any($2)
      order by ar.ordem, a.tipo, a.ordem, a.id`, [comp, areas], db)
  const nomeDef = new Map(defs.map((d) => [d.codigo, d.nome]))
  const analises: AnaliseRelatorio[] = analisesRows.map((a) => ({
    id: a.id, area: a.area_codigo, areaNome: nomeArea(a.area_codigo), tipo: a.tipo, tipoRotulo: ROTULO_ANALISE[a.tipo],
    fato: sanitizarTexto(a.fato) ?? '', numero: sanitizarTexto(a.numero), indicadorCodigo: a.indicador_codigo,
    indicadorNome: a.indicador_codigo ? nomeDef.get(a.indicador_codigo) ?? a.indicador_codigo : null,
    ocorrencia: sanitizarTexto(a.ocorrencia), responsavel: sanitizarTexto(a.responsavel) ?? '',
    areaDependente: a.area_dependente ? nomeArea(a.area_dependente) : null,
  }))

  const indicadores: IndicadorRelatorio[] = []
  for (const d of selecionadas) {
    const r = { MES: porEscopo.MES.get(d.codigo), TRIMESTRE: porEscopo.TRIMESTRE.get(d.codigo), SEMESTRE: porEscopo.SEMESTRE.get(d.codigo), ANO: porEscopo.ANO.get(d.codigo) }
    if (!r.MES || !r.TRIMESTRE || !r.SEMESTRE || !r.ANO) continue
    const evolucao: PontoEvolucao[] = r.ANO.memoria.meses.map((m) => ({
      competencia: m.competencia, rotulo: competenciaCurta(m.competencia), valor: m.valor,
      texto: textoValor(m.valor, m.situacao, d.unidade_medida, d.casas_decimais), situacao: m.situacao,
    }))
    const area = d.area_codigo as AreaCodigo
    indicadores.push({
      codigo: d.codigo, nome: d.nome, area, areaNome: nomeArea(area), secao: secaoDoIndicador(d.codigo, area), classe: d.classe,
      unidade: d.unidade_medida, casas: d.casas_decimais, direcao: d.direcao, consolidacao: d.consolidacao, formula: d.formula,
      descricao: d.descricao, fonteRegra: d.fonte_regra, origemDados: d.origem_dados, homologado: d.homologado, pendencias: d.pendencias,
      mes: valorPeriodo(r.MES), trimestre: valorPeriodo(r.TRIMESTRE), semestre: valorPeriodo(r.SEMESTRE), ano: valorPeriodo(r.ANO),
      evolucao, ...tendencia(evolucao, d.direcao),
      comentarios: analises.filter((a) => a.indicadorCodigo === d.codigo && ['EXPLICACAO_DESVIO', 'DESTAQUE', 'ATENCAO'].includes(a.tipo))
        .map((a) => ({ tipo: a.tipoRotulo, texto: a.numero ? `${a.fato} (${a.numero})` : a.fato })),
    })
  }

  // Quebras por dimensão (séries) das seções do escopo
  const quebras: Quebra[] = []
  const secoesEscopo = new Set(indicadores.map((i) => i.secao))
  for (const qd of QUEBRAS) {
    const areaQ = qd.secao.startsWith('TI') ? 'TI' : qd.secao.startsWith('COMODATO') ? 'COMODATO' : (qd.secao as AreaCodigo)
    if (!areas.includes(areaQ)) continue
    const usadaIsolado = p.escopo !== 'CONSOLIDADO' && GRUPOS_ISOLADOS[p.escopo].some((g) => g.quebra === qd.id)
    if (p.modo === 'EXECUTIVO' && !qd.executivo && !usadaIsolado) continue
    const qb = await montarQuebra(qd, comp, anonimizar, db)
    if (qb) { quebras.push(qb); secoesEscopo.add(qb.secao) }
  }

  // Estoque de comodato (fotografia do fim do mês)
  const tabelasExtras: TabelaExtra[] = []
  if (areas.includes('COMODATO')) {
    const pos = await q<{ produto: string; novos: number; usados: number; entradas: number; saidas: number; manut: number | null; sucata: number | null }>(
      `select produto, sum(novos)::int novos, sum(usados)::int usados, sum(entradas)::int entradas, sum(saidas_novos + saidas_usados)::int saidas,
              sum(manutencao_interna)::int manut, sum(sucata)::int sucata
         from comodato_posicao where competencia = $1 and excluido_em is null and ($2::int[] is null or unidade_id = any($2))
        group by produto order by sum(novos + usados) desc, produto limit 12`, [comp, p.unidades?.length ? p.unidades : null], db)
    if (pos.length) {
      tabelasExtras.push({ id: 'CO_ESTOQUE', secao: 'COMODATO_ATENDIMENTO', titulo: 'Estoque de comodato no fim do mês',
        colunas: ['Produto', 'Entradas', 'Saídas', 'Novos', 'Usados', 'Em manutenção', 'Sucata'],
        alinhamento: ['esquerda', 'direita', 'direita', 'direita', 'direita', 'direita', 'direita'],
        linhas: pos.map((x) => [x.produto, numero(x.entradas), numero(x.saidas), numero(x.novos), numero(x.usados), numero(x.manut), numero(x.sucata)]),
        fonte: 'comodato_posicao (lançamentos do sistema)' })
    }
  }

  // Planos de ação (abertos + criados para a competência)
  const fimComp = ultimoDia(comp)
  const planosRows = await q<{ codigo: string; area_codigo: AreaCodigo; indicador_codigo: string | null; ocorrencia: string | null; acao: string; responsavel_nome: string; inicio: string; prazo: string; status: string; criticidade: string; competencia_origem: string | null }>(
    `select p.codigo, p.area_codigo, p.indicador_codigo, p.ocorrencia, p.acao, p.responsavel_nome, p.inicio::text, p.prazo::text, p.status, p.criticidade,
            p.competencia_origem::text
       from plano_acao p
      where p.area_codigo = any($1) and p.status <> 'CANCELADA'
        and (p.competencia_origem = $2 or (p.status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA') and p.inicio <= $3))
      order by (p.status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA') and p.prazo < $3) desc,
               case p.criticidade when 'ALTA' then 0 when 'MEDIA' then 1 else 2 end, p.prazo, p.codigo`, [areas, comp, fimComp], db)
  const planos: PlanoRelatorio[] = planosRows.map((x) => {
    const aberto = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_EFICACIA'].includes(x.status)
    return {
      codigo: x.codigo, area: x.area_codigo, areaNome: nomeArea(x.area_codigo), indicadorCodigo: x.indicador_codigo,
      indicador: x.indicador_codigo ? nomeDef.get(x.indicador_codigo) ?? x.indicador_codigo : sanitizarTexto(x.ocorrencia) ?? 'Ocorrência',
      acao: sanitizarTexto(x.acao) ?? '', responsavel: sanitizarTexto(x.responsavel_nome) ?? '', inicio: x.inicio, prazo: x.prazo, prazoTexto: fmtData(x.prazo),
      status: x.status, statusRotulo: ROTULO_PLANO[x.status] ?? x.status, criticidade: x.criticidade,
      vencida: aberto && x.prazo < fimComp, competenciaOrigem: x.competencia_origem,
    }
  })

  // Metas do próximo ciclo
  const prox = somarMeses(comp, 1)
  const metasRows = await q<{ indicador_codigo: string; versao: number; ciclo: string; tipo: string; operador: '>=' | '<=' | '=' | 'ENTRE'; valor: number | null; valor_max: number | null; linha_base: number | null; tolerancia_pct: number; status: 'APROVADA' | 'PROPOSTA'; vigencia_inicio: string; vigencia_fim: string | null; fonte_documento: string; motivo: string }>(
    `select indicador_codigo, versao, ciclo, tipo, operador, valor, valor_max, linha_base, tolerancia_pct, status, vigencia_inicio::text, vigencia_fim::text, fonte_documento, motivo
       from meta
      where (status = 'APROVADA' and vigencia_inicio <= $2 and (vigencia_fim is null or vigencia_fim >= $1))
         or (status = 'PROPOSTA' and (vigencia_fim is null or vigencia_fim >= $1))
      order by indicador_codigo, case ciclo when 'MENSAL' then 0 when 'TRIMESTRAL' then 1 when 'SEMESTRAL' then 2 else 3 end, status, versao desc`,
    [prox, ultimoDia(prox)], db)
  const defsMeta = new Map((p.modo === 'COMPLETO' ? defs : selecionadas).map((d) => [d.codigo, d]))
  const vistos = new Set<string>()
  const metas: MetaProximoCiclo[] = []
  const ordemDef = new Map(defs.map((d, i) => [d.codigo, i]))
  for (const m of metasRows.sort((a, b) => (ordemDef.get(a.indicador_codigo) ?? 999) - (ordemDef.get(b.indicador_codigo) ?? 999))) {
    const d = defsMeta.get(m.indicador_codigo)
    if (!d) continue
    if (p.modo === 'EXECUTIVO' && m.ciclo !== 'MENSAL' && m.status === 'APROVADA') continue
    const chave = `${m.indicador_codigo}|${m.ciclo}|${m.status}`
    if (m.status === 'APROVADA' && vistos.has(chave)) continue
    vistos.add(chave)
    metas.push({
      indicadorCodigo: m.indicador_codigo, indicador: d.nome, area: d.area_codigo as AreaCodigo, areaNome: nomeArea(d.area_codigo),
      ciclo: ROTULO_CICLO[m.ciclo] ?? m.ciclo, descricao: descreverMetaCiclo(m, d.unidade_medida, d.casas_decimais),
      situacao: m.status, situacaoRotulo: m.status === 'APROVADA' ? 'Aprovada' : 'Proposta (aguarda aprovação)',
      vigencia: `${fmtData(m.vigencia_inicio)}${m.vigencia_fim ? ` a ${fmtData(m.vigencia_fim)}` : ' em diante'}`,
      fonte: m.fonte_documento.replace(/^SEED:/, ''), motivo: sanitizarTexto(m.motivo) ?? '',
    })
  }

  // Fechamento e selo
  const periodos = await periodosDaCompetencia(comp, db)
  const sit = await situacaoConsolidada(comp, db)
  const pendentes = sit.pendentes.filter((a) => areas.includes(a as AreaCodigo))
  const fechamento: FechamentoArea[] = periodos.map((x) => ({ area: x.area, areaNome: nomeArea(x.area), status: x.status, statusRotulo: ROTULO_STATUS[x.status], noEscopo: areas.includes(x.area) }))
  const selo = pendentes.length === 0 ? 'OFICIAL' : 'PRELIMINAR'

  // Semáforo e mensagens-chave
  const base = indicadores.filter((i) => i.classe === 'ESSENCIAL').length ? indicadores.filter((i) => i.classe === 'ESSENCIAL') : indicadores
  const cont = (s: string) => base.filter((i) => i.mes.status === s).length
  const semaforo = { verde: cont('VERDE'), amarelo: cont('AMARELO'), vermelho: cont('VERMELHO'), semMeta: cont('SEM_META'), na: cont('NA'), total: base.length }
  const avaliados = semaforo.verde + semaforo.amarelo + semaforo.vermelho
  const mensagens: string[] = []
  mensagens.push(avaliados
    ? `${semaforo.verde} de ${avaliados} indicadores essenciais com meta avaliada estão na meta; ${semaforo.amarelo} em atenção e ${semaforo.vermelho} fora da meta.${semaforo.semMeta + semaforo.na ? ` ${semaforo.semMeta + semaforo.na} sem meta homologada ou sem dado suficiente.` : ''}`
    : `Nenhum indicador essencial com meta avaliada na competência: ${semaforo.semMeta + semaforo.na} sem meta homologada ou sem dado suficiente.`)
  const vermelhos = base.filter((i) => i.mes.status === 'VERMELHO')
  if (vermelhos.length) {
    mensagens.push(`Fora da meta: ${vermelhos.slice(0, 3).map((i) => `${i.nome} (${i.mes.texto}; meta ${i.mes.metaTexto})`).join('; ')}${vermelhos.length > 3 ? ` e mais ${vermelhos.length - 3}` : ''}.`)
  }
  for (const a of analises.filter((x) => x.tipo === 'DESTAQUE')) mensagens.push(`${a.areaNome}: ${a.fato}${a.numero ? ` (${a.numero})` : ''}.`.replace(/\.\.$/, '.'))
  for (const a of analises.filter((x) => x.tipo === 'ATENCAO')) mensagens.push(`Atenção — ${a.areaNome}: ${a.fato}${a.numero ? ` (${a.numero})` : ''}.`.replace(/\.\.$/, '.'))
  const limiteMsg = p.modo === 'EXECUTIVO' ? 3 : 6

  // Detalhes (somente Excel)
  const corte = await dataCorteMigracao(db)
  const detalhes = p.incluirDetalhes
    ? await montarDetalhes({ comp, areas, unidades: p.unidades?.length ? p.unidades : null, usuario: p.usuario, anonimizar, historico: comp < corte, db })
    : []

  let unidadesRotulo = 'Todas as unidades'
  if (p.unidades?.length) {
    const us = await q<{ nome: string }>(`select nome from unidade where id = any($1) order by nome`, [p.unidades], db)
    unidadesRotulo = us.map((x) => x.nome).join(', ') || 'Todas as unidades'
  }
  const agora = new Date()
  const mesesTag = [somarMeses(comp, -2), somarMeses(comp, -1), comp].map((m) => competenciaCurta(m).slice(0, 3).toUpperCase()).join(' • ')
  const semHash: Omit<DadosRelatorio, 'hash'> = {
    metadados: {
      competencia: comp, competenciaRotulo: competenciaLonga(comp).replace(/^./, (c) => c.toUpperCase()), competenciaCurta: competenciaCurta(comp),
      competenciaArquivo: competenciaArquivo(comp), escopo: p.escopo, escopoRotulo: ROTULO_ESCOPO[p.escopo], modo: p.modo, modoRotulo: ROTULO_MODO[p.modo],
      areas, unidades: p.unidades?.length ? p.unidades : null, unidadesRotulo,
      filtros: [
        { rotulo: 'Competência', valor: competenciaLonga(comp) },
        { rotulo: 'Escopo', valor: ROTULO_ESCOPO[p.escopo] },
        { rotulo: 'Modo', valor: ROTULO_MODO[p.modo] },
        { rotulo: 'Unidades', valor: p.unidades?.length ? `${unidadesRotulo} (aplicado às linhas de origem; indicadores consolidados da empresa)` : unidadesRotulo },
        { rotulo: 'Classes de indicadores', valor: classes.map((c) => c.toLowerCase()).join(', ') },
      ],
      geradoEm: agora.toISOString(), geradoEmTexto: dataHora(agora), usuario: p.usuario.nome, selo, pendentes, pendentesRotulo: pendentes.map(nomeArea),
      fechamento, regraSemaforo: REGRA_SEMAFORO, fonteExportacao, anonimizarNomes: anonimizar, logotipo,
      fonteDados: `Motor de indicadores (indicador_resultado) e séries mensais; competências anteriores a ${fmtData(corte)} usam o histórico migrado da planilha quando existir.`,
      mesesTag, versao: null,
    },
    mensagens: mensagens.slice(0, limiteMsg),
    semaforo, indicadores, quebras, tabelasExtras, analises, planos, metas, detalhes,
  }
  return { ...semHash, hash: hashDados(semHash) }
}

/** Todas as áreas (para rótulos na interface). */
export const AREAS_RELATORIO = AREAS
