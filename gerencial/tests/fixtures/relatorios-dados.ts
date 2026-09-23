/** Snapshot sintético (sem banco) para os testes unitários dos geradores. */
import type { DadosRelatorio, EscopoRelatorio, IndicadorRelatorio, ModoRelatorio, ValorPeriodo } from '@/lib/relatorios/tipos'
import { GRUPOS_ISOLADOS, AREAS_DO_ESCOPO, secaoDoIndicador } from '@/lib/relatorios/nomes'
import { hashDados } from '@/lib/relatorios/dados'
import type { AreaCodigo } from '@/lib/auth/permissoes'

const MESES = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']

function periodo(escopo: ValorPeriodo['escopo'], valor: number | null, status: ValorPeriodo['status']): ValorPeriodo {
  return {
    escopo, rotulo: escopo === 'MES' ? '07/2026' : escopo, periodoInicio: '2026-07-01', periodoFim: '2026-07-31', valor,
    texto: valor === null ? 'Não informado' : `${String(valor).replace('.', ',')}%`, numerador: null, denominador: null, alvo: 95,
    metaTexto: '≥ 95%', status, statusTexto: status === 'VERDE' ? '✓ Na meta' : '▲ Fora da meta', valorAnterior: 90, anteriorTexto: '90,0%',
    variacaoAbs: 1, variacaoPct: 1, variacaoTexto: '+1,0 p.p.', situacao: valor === null ? 'NAO_INFORMADO' : 'OK', motivo: null,
    fonte: 'EVENTOS', regra: 'Recalculada', calculadoEm: '2026-08-01T12:00:00Z',
  }
}

export function indicadorFicticio(codigo: string, area: AreaCodigo, nome = `Indicador ${codigo}`, valor: number | null = 96.5): IndicadorRelatorio {
  const st = valor !== null && valor >= 95 ? 'VERDE' : 'VERMELHO'
  return {
    codigo, nome, area, areaNome: area, secao: secaoDoIndicador(codigo, area), classe: 'ESSENCIAL', unidade: '%', casas: 1,
    direcao: 'MAIOR_MELHOR', consolidacao: 'MEDIA_PONDERADA', formula: 'a ÷ b × 100', descricao: nome, fonteRegra: 'Teste', origemDados: 'teste',
    homologado: true, pendencias: null, mes: periodo('MES', valor, st), trimestre: periodo('TRIMESTRE', valor, st), semestre: periodo('SEMESTRE', valor, st),
    ano: periodo('ANO', valor, st), evolucao: MESES.map((m, i) => ({ competencia: m, rotulo: m.slice(5, 7), valor: i < 3 ? null : 90 + i, texto: 'x', situacao: 'OK' })),
    tendencia: 'ALTA', tendenciaTexto: '↗ Em alta (favorável)', comentarios: [],
  }
}

export function dadosFicticios(escopo: EscopoRelatorio = 'CONSOLIDADO', modo: ModoRelatorio = 'EXECUTIVO'): DadosRelatorio {
  const areas = AREAS_DO_ESCOPO[escopo]
  const codigos = escopo === 'CONSOLIDADO' ? [...GRUPOS_ISOLADOS.COMODATO_MANUTENCAO, ...GRUPOS_ISOLADOS.TI].flatMap((g) => g.codigos) : GRUPOS_ISOLADOS[escopo].flatMap((g) => g.codigos)
  const areaDe = (c: string): AreaCodigo => (c.startsWith('TI') ? 'TI' : c.startsWith('MI') ? 'MANUT_INTERNA' : c.startsWith('ME') ? 'MANUT_EXTERNA' : c.startsWith('EP') ? 'ESTOQUE_PECAS' : 'COMODATO')
  const indicadores = codigos.map((c, i) => indicadorFicticio(c, areaDe(c), i === 0 ? 'Nome <script>alert(1)</script> & "aspas"' : `Indicador ${c}`, i % 3 === 0 ? 80 : 97))
  const d: Omit<DadosRelatorio, 'hash'> = {
    metadados: {
      competencia: '2026-07-01', competenciaRotulo: 'Julho/2026', competenciaCurta: 'jul/26', competenciaArquivo: '2026-07', escopo, escopoRotulo: escopo,
      modo, modoRotulo: modo, areas, unidades: null, unidadesRotulo: 'Todas as unidades', filtros: [{ rotulo: 'Competência', valor: 'julho/2026' }],
      geradoEm: '2026-08-01T12:00:00Z', geradoEmTexto: '01/08/2026, 09:00', usuario: 'Usuário Teste', selo: 'PRELIMINAR', pendentes: ['TI'], pendentesRotulo: ['TI'],
      fechamento: areas.map((a) => ({ area: a, areaNome: a, status: 'RASCUNHO', statusRotulo: 'Rascunho', noEscopo: true })), regraSemaforo: 'Verde...',
      fonteExportacao: 'SEGURA', anonimizarNomes: false, logotipo: null, fonteDados: 'teste', mesesTag: 'MAI • JUN • JUL', versao: 3,
    },
    mensagens: ['Mensagem um', 'Mensagem dois'],
    semaforo: { verde: 2, amarelo: 0, vermelho: 1, semMeta: 0, na: 0, total: 3 },
    indicadores,
    quebras: [{
      id: 'TI_ABERTOS_CATEGORIA', secao: 'TI_OPERACAO', titulo: 'Chamados por categoria', serie: 'TI_ABERTOS', dimensao: 'CATEGORIA', dimensaoRotulo: 'Categoria',
      unidade: 'qtd', tipo: 'COMPARATIVO', meses: ['2026-05-01', '2026-06-01', '2026-07-01'], rotulosMeses: ['mai/26', 'jun/26', 'jul/26'], totais: [10, 12, 9],
      totaisTexto: ['10', '12', '9'], itens: [{ dimensao: 'Acesso', valores: [5, 6, 4], atual: 4, participacao: 44.4, acumulado: 44.4, classeA: true }, { dimensao: 'Rede', valores: [5, 6, 5], atual: 5, participacao: 55.6, acumulado: 100, classeA: true }],
      fonte: 'lançamentos do sistema',
    }],
    tabelasExtras: [],
    analises: [],
    planos: [],
    metas: [],
    detalhes: [{
      aba: 'Dados - Chamados TI', area: 'TI', titulo: 'Chamados', colunas: [{ chave: 'numero', titulo: 'Chamado', tipo: 'texto' }, { chave: 'aberto_em', titulo: 'Abertura', tipo: 'dataHora' }, { chave: 'titulo', titulo: 'Título', tipo: 'texto' }],
      linhas: [{ numero: 'TI-1', aberto_em: '2026-07-02T12:00:00Z', titulo: 'Sem acesso [contato removido]' }],
    }],
  }
  return { ...d, hash: hashDados(d) }
}
