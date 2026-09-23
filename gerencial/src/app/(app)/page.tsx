import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { nomeArea, pode } from '@/lib/auth/permissoes'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { competenciaLonga, data } from '@/lib/format'
import { rotuloEscopo } from '@/lib/competencia'
import { calcularPainel, type Resultado } from '@/lib/indicadores/motor'
import { INDICADORES } from '@/lib/indicadores/catalogo'
import { periodosDaCompetencia, situacaoConsolidada, ROTULO_STATUS } from '@/lib/fechamento'
import { analisesDaCompetencia, planosAbertos } from '@/lib/gestao'
import { Alerta, BotaoLink, Cabecalho, Card, Etiqueta, Grade, Tabela, Td, Th, Vazio } from '@/components/ui'
import { KpiCard } from '@/components/KpiCard'
import { BarraFiltros } from '@/components/BarraFiltros'
import { escopoDe } from '@/components/SeletorEscopo'

export const metadata = { title: 'Dashboard executivo' }

const bloco = (codigo: string) => INDICADORES.find((i) => i.codigo === codigo)?.bloco

export default async function DashboardExecutivo({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('painel.ler')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const [resultados, periodos, selo, analises, vencidos] = await Promise.all([
    calcularPainel(comp, escopo, { classes: ['ESSENCIAL'] }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    situacaoConsolidada(comp),
    analisesDaCompetencia(comp),
    planosAbertos({ somenteVencidos: true }),
  ])
  const comodato = resultados.filter((r) => bloco(r.codigo) === 'COMODATO_MANUTENCAO')
  const ti = resultados.filter((r) => bloco(r.codigo) === 'TI')
  const vermelhos = resultados.filter((r) => r.status === 'VERMELHO')
  const naoInformados = resultados.filter((r) => r.situacao === 'NAO_INFORMADO')
  const riscos = analises.filter((a) => a.tipo === 'RISCO')
  const decisoes = analises.filter((a) => a.tipo === 'DECISAO_SOLICITADA')

  return (
    <div>
      <Cabecalho
        titulo="Dashboard executivo"
        subtitulo={`${competenciaLonga(comp)} · ${rotuloEscopo(comp, escopo)} · indicadores essenciais do padrão gerencial`}
        acoes={pode(u, 'relatorio.gerar') && <BotaoLink variante="destaque" href={`/relatorios?competencia=${comp}`}>Gerar apresentação da Diretoria</BotaoLink>}
      />
      <BarraFiltros competencia={comp} escopo={escopo} base="/" />

      <Card className="mb-6" titulo="Situação do fechamento"
        acoes={selo.oficial ? <Etiqueta tom="ok">✓ Consolidado oficial</Etiqueta> : <Etiqueta tom="atencao">! Preliminar — {selo.pendentes.length} área(s) sem aprovação</Etiqueta>}>
        <ul className="flex flex-wrap gap-2">
          {periodos.map((p) => (
            <li key={p.area}>
              <Link href={`/fechamento?competencia=${comp}#${p.area}`} className="inline-flex items-center gap-2 rounded-md border border-pedra px-3 py-1.5 text-sm hover:bg-creme">
                <span className="font-semibold">{nomeArea(p.area)}</span>
                <Etiqueta tom={p.status === 'FECHADO' || p.status === 'APROVADO' ? 'ok' : p.status === 'EM_VALIDACAO' ? 'dourado' : 'neutro'}>{ROTULO_STATUS[p.status]}</Etiqueta>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {(vermelhos.length > 0 || vencidos.length > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {vermelhos.length > 0 && (
            <Alerta tom="critico" titulo={`▲ ${vermelhos.length} indicador(es) fora da meta`}>
              {vermelhos.map((r) => r.nome).join(' · ')} — cada um exige plano de ação com responsável e prazo.
            </Alerta>
          )}
          {vencidos.length > 0 && (
            <Alerta tom="atencao" titulo={`! ${vencidos.length} ação(ões) vencida(s)`}>
              <Link className="underline" href="/planos-acao?situacao=vencidas">Ver planos de ação vencidos</Link>
            </Alerta>
          )}
        </div>
      )}
      {naoInformados.length > 0 && (
        <div className="mb-6">
          <Alerta titulo={`${naoInformados.length} indicador(es) sem dados de origem`}>
            Valores ausentes aparecem como “Não informado” (nunca como zero). Veja o motivo em cada cartão e as pendências em{' '}
            <Link className="underline" href="/homologacao">Pendências de homologação</Link>.
          </Alerta>
        </div>
      )}

      <Secao titulo="Comodato e manutenção" resultados={comodato} comp={comp} />
      <Secao titulo="Tecnologia da Informação" resultados={ti} comp={comp} />

      <Grade cols={2} className="mt-6">
        <Card titulo="Riscos e dependências">
          {riscos.length === 0 && analises.filter((a) => a.tipo === 'DEPENDENCIA').length === 0 ? <Vazio>Nenhum risco registrado para a competência.</Vazio> : (
            <ul className="flex flex-col gap-2 text-sm">
              {analises.filter((a) => a.tipo === 'RISCO' || a.tipo === 'DEPENDENCIA').map((a) => (
                <li key={a.id} className="rounded-md border border-pedra/60 p-2">
                  <Etiqueta tom={a.tipo === 'RISCO' ? 'critico' : 'dourado'}>{a.tipo === 'RISCO' ? 'Risco' : 'Dependência'}</Etiqueta>{' '}
                  <span className="font-semibold">{nomeArea(a.area_codigo)}:</span> {a.fato} <span className="text-neutro">— {a.responsavel}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card titulo="Decisões solicitadas à Diretoria">
          {decisoes.length === 0 ? <Vazio>Nenhuma decisão solicitada para a competência.</Vazio> : (
            <ul className="flex flex-col gap-2 text-sm">
              {decisoes.map((a) => <li key={a.id} className="rounded-md border border-pedra/60 p-2"><span className="font-semibold">{nomeArea(a.area_codigo)}:</span> {a.fato} <span className="text-neutro">— {a.responsavel}</span></li>)}
            </ul>
          )}
        </Card>
      </Grade>

      {vencidos.length > 0 && (
        <Card className="mt-6" titulo="Ações vencidas">
          <Tabela legenda="Ações vencidas">
            <thead><tr><Th>Plano</Th><Th>Área</Th><Th>Ação</Th><Th>Responsável</Th><Th>Prazo</Th></tr></thead>
            <tbody>
              {vencidos.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <Td><Link className="font-semibold text-vinho" href={`/planos-acao/${p.id}`}>{p.codigo}</Link></Td>
                  <Td>{nomeArea(p.area_codigo)}</Td><Td>{p.acao}</Td><Td>{p.responsavel_nome}</Td>
                  <Td><Etiqueta tom="critico">▲ {data(p.prazo)}</Etiqueta></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Card>
      )}
    </div>
  )
}

function Secao({ titulo, resultados, comp }: { titulo: string; resultados: Resultado[]; comp: string }) {
  const cont = { VERDE: 0, AMARELO: 0, VERMELHO: 0 }
  resultados.forEach((r) => { if (r.status in cont) cont[r.status as keyof typeof cont]++ })
  return (
    <section className="mb-8" aria-labelledby={`sec-${titulo}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`sec-${titulo}`} className="text-lg font-extrabold">{titulo}</h2>
        <p className="text-xs text-neutro">✓ {cont.VERDE} na meta · ! {cont.AMARELO} em atenção · ▲ {cont.VERMELHO} fora da meta</p>
      </div>
      <Grade cols={3}>{resultados.map((r) => <KpiCard key={r.codigo} r={r} competencia={comp} />)}</Grade>
    </section>
  )
}
