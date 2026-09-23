import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, nomeArea } from '@/lib/auth/permissoes'
import { calcularIndicador, definicao, serieMensalIndicador } from '@/lib/indicadores/motor'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { mesesDoEscopo, rotuloEscopo } from '@/lib/competencia'
import { competenciaCurta, dataHora, numero, valorIndicador, NAO_APLICAVEL } from '@/lib/format'
import { Alerta, BotaoLink, Cabecalho, Card, Etiqueta, Grade, Semaforo, Tabela, Td, Th } from '@/components/ui'
import { BarraFiltros } from '@/components/BarraFiltros'
import { escopoDe } from '@/components/SeletorEscopo'
import { GraficoEvolucao, GraficoLinha } from '@/components/graficos/Graficos'
import { TabelaDados } from '@/components/TabelaDados'
import { KpiCard } from '@/components/KpiCard'

const FONTE: Record<string, string> = { EVENTOS: 'Lançamentos', HISTORICO: 'Histórico migrado', MISTO: 'Misto', NENHUMA: '—' }
const SITUACAO: Record<string, string> = { OK: 'Calculado', NAO_INFORMADO: 'Não informado', NAO_APLICAVEL: 'N/A' }

/** Onde conferir os registros que originaram o número. */
const ORIGEM: Record<string, { rotulo: string; href: string }[]> = {
  MANUT_INTERNA: [{ rotulo: 'Lançamentos da oficina', href: '/manutencao-interna/lancamentos' }, { rotulo: 'Histórico migrado', href: '/manutencao-interna/historico' }],
  MANUT_EXTERNA: [{ rotulo: 'Chamados', href: '/manutencao-externa/chamados' }, { rotulo: 'Trocas', href: '/manutencao-externa/trocas' }, { rotulo: 'Histórico migrado', href: '/manutencao-externa/historico' }],
  ESTOQUE_PECAS: [{ rotulo: 'Movimentações', href: '/estoque-pecas/movimentos' }, { rotulo: 'Saldos', href: '/estoque-pecas/saldos' }, { rotulo: 'Histórico migrado', href: '/estoque-pecas/historico' }],
  COMODATO: [{ rotulo: 'Movimentações', href: '/comodato/movimentos' }, { rotulo: 'Posição mensal', href: '/comodato/posicao' }, { rotulo: 'Base ativa e consumo', href: '/comodato/base' }, { rotulo: 'Histórico migrado', href: '/comodato/historico' }],
  TI: [{ rotulo: 'Chamados', href: '/ti/chamados' }, { rotulo: 'Disponibilidade', href: '/ti/disponibilidade' }, { rotulo: 'Backup e restauração', href: '/ti/continuidade' }, { rotulo: 'Incidentes', href: '/ti/incidentes' }, { rotulo: 'Projetos', href: '/ti/projetos' }],
}

export default async function VerCalculo({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: SearchParams }) {
  const { codigo } = await params
  const sp = await searchParams
  const def = await definicao(codigo)
  if (!def) notFound()
  const u = await exigirPermissao('painel.ler')
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const r = await calcularIndicador(codigo, comp, escopo, { usuarioId: u.id })
  const meses = mesesDoEscopo(comp, 'ANO')
  const serie = await serieMensalIndicador(codigo, meses)
  const ehTaxa = ['MEDIA_PONDERADA', 'TAXA_CONTAGEM', 'MEDIA_SIMPLES'].includes(def.consolidacao)
  const pontos = serie.map((s) => ({ rotulo: competenciaCurta(s.competencia), valor: s.valor, atual: s.competencia === comp }))
  const alvoGrafico = serie.find((s) => s.competencia === comp)?.alvo ?? null
  const un = def.unidade_medida === '%' ? '%' : ''
  const area = AREAS.find((a) => a.codigo === def.area_codigo)

  return (
    <div>
      <Cabecalho titulo={def.nome} subtitulo={<>{nomeArea(def.area_codigo)} · <span className="font-mono">{def.codigo}</span> · versão {def.versao}</>}
        acoes={area && <BotaoLink href={`${area.rota}?competencia=${comp}`}>Painel da área</BotaoLink>} />
      <BarraFiltros competencia={comp} escopo={escopo} base={`/indicadores/${codigo}`} />
      {!def.homologado && <div className="mb-4"><Alerta tom="atencao" titulo="! Definição pendente de homologação">{def.pendencias ?? 'Aguardando aprovação formal.'}</Alerta></div>}
      <Grade cols={3}>
        <KpiCard r={r} competencia={comp} />
        <Card titulo="Definição" className="xl:col-span-2">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="font-semibold">Descrição</dt><dd>{def.descricao}</dd>
            <dt className="font-semibold">Fórmula</dt><dd>{def.formula}</dd>
            {def.numerador && <><dt className="font-semibold">Numerador</dt><dd>{def.numerador}</dd></>}
            {def.denominador && <><dt className="font-semibold">Denominador</dt><dd>{def.denominador}</dd></>}
            <dt className="font-semibold">Origem dos dados</dt><dd>{def.origem_dados}</dd>
            <dt className="font-semibold">Consolidação</dt><dd>{r.memoria.regra}</dd>
            <dt className="font-semibold">Direção</dt><dd>{{ MAIOR_MELHOR: 'Maior é melhor', MENOR_MELHOR: 'Menor é melhor', FAIXA: 'Dentro da faixa', INFORMATIVO: 'Informativo (sem meta)' }[def.direcao]}</dd>
            <dt className="font-semibold">Denominador zero</dt><dd>Exibe N/A com o motivo; nunca é classificado como verde.</dd>
            <dt className="font-semibold">Fonte da regra</dt><dd>{def.fonte_regra}</dd>
          </dl>
        </Card>
      </Grade>

      <Grade cols={2} className="mt-4">
        <Card titulo={`Evolução mensal ${comp.slice(0, 4)}`}>
          {ehTaxa ? <GraficoLinha dados={pontos} meta={alvoGrafico} casas={def.casas_decimais} unidade={un} /> : <GraficoEvolucao dados={pontos} meta={alvoGrafico} casas={def.casas_decimais} unidade={un} />}
          <TabelaDados colunas={['Competência', 'Realizado', 'Meta', 'Status']}
            linhas={serie.map((s) => [competenciaCurta(s.competencia), valorIndicador(s.valor, def.unidade_medida, def.casas_decimais), s.alvo === null ? '—' : numero(s.alvo, def.casas_decimais), s.status])} />
        </Card>
        <Card titulo="Meta aplicada">
          {r.memoria.meta ? (
            <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
              <dt className="font-semibold">Meta</dt><dd>{r.metaDescricao}</dd>
              <dt className="font-semibold">Ciclo / versão</dt><dd>{r.memoria.meta.ciclo} · v{r.memoria.meta.versao}</dd>
              <dt className="font-semibold">Tipo</dt><dd>{r.memoria.meta.tipo}</dd>
              <dt className="font-semibold">Tolerância</dt><dd>{numero(r.memoria.meta.tolerancia_pct, 1)}% (na direção do indicador)</dd>
              {r.memoria.meta.observacao && <><dt className="font-semibold">Observação</dt><dd>{r.memoria.meta.observacao}</dd></>}
              <dt className="font-semibold">Documento</dt><dd>{r.memoria.meta.fonte.replace(/^SEED:/, '')}</dd>
            </dl>
          ) : <p className="text-sm text-neutro">Sem meta aprovada vigente para {rotuloEscopo(comp, escopo)}.</p>}
          <p className="mt-3 text-sm"><Link className="font-semibold text-vinho" href={`/metas?indicador=${codigo}`}>Histórico de metas →</Link></p>
        </Card>
      </Grade>

      <Card className="mt-4" titulo="Memória de cálculo (reproduzível)" acoes={<span className="text-xs text-neutro">Calculado em {dataHora(r.calculadoEm)} · definição v{r.memoria.definicao.versao} · calculador {r.memoria.definicao.calculador}</span>}>
        <Tabela legenda="Memória de cálculo">
          <thead><tr><Th>Competência</Th><Th alinhar="direita">Numerador</Th><Th alinhar="direita">Denominador</Th><Th alinhar="direita">Valor</Th><Th>Situação</Th><Th>Fonte</Th><Th>Observação</Th></tr></thead>
          <tbody>
            {r.memoria.meses.map((m) => (
              <tr key={m.competencia}>
                <Td>{competenciaCurta(m.competencia)}</Td>
                <Td alinhar="direita">{m.numerador === null || m.numerador === undefined ? '—' : numero(m.numerador, 2)}</Td>
                <Td alinhar="direita">{m.denominador === null || m.denominador === undefined ? '—' : numero(m.denominador, 2)}</Td>
                <Td alinhar="direita">{m.situacao === 'OK' ? valorIndicador(m.valor, def.unidade_medida, def.casas_decimais) : m.situacao === 'NAO_APLICAVEL' ? NAO_APLICAVEL : 'Não informado'}</Td>
                <Td>{SITUACAO[m.situacao]}</Td>
                <Td>{FONTE[m.fonte]}</Td>
                <Td className="text-xs text-neutro">{[m.motivo, m.detalhes ? Object.entries(m.detalhes).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : ''].filter(Boolean).join(' — ')}</Td>
              </tr>
            ))}
            <tr className="bg-creme font-semibold">
              <Td>{rotuloEscopo(comp, escopo)}</Td>
              <Td alinhar="direita">{r.numerador === null ? '—' : numero(r.numerador, 2)}</Td>
              <Td alinhar="direita">{r.denominador === null ? '—' : numero(r.denominador, 2)}</Td>
              <Td alinhar="direita">{valorIndicador(r.valor, def.unidade_medida, def.casas_decimais)}</Td>
              <Td><Semaforo status={r.status} /></Td><Td>{FONTE[r.fonte]}</Td><Td className="text-xs">{r.motivo ?? ''}</Td>
            </tr>
          </tbody>
        </Tabela>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Registros de origem:</span>
          {(ORIGEM[def.area_codigo] ?? []).map((o) => <BotaoLink key={o.href} href={`${o.href}?competencia=${comp}`}>{o.rotulo}</BotaoLink>)}
          <Etiqueta tom="neutro">hash {r.memoria.auditoria_max_id}</Etiqueta>
        </div>
      </Card>
    </div>
  )
}
