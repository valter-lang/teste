import { exigirPermissao } from '@/lib/auth/sessao'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { somarMeses } from '@/lib/competencia'
import { calcularPainel } from '@/lib/indicadores/motor'
import { periodosDaCompetencia } from '@/lib/fechamento'
import { lerSerie, type SerieCodigo } from '@/lib/indicadores/series'
import { evolucao } from '@/lib/paineis'
import { q } from '@/lib/db'
import { competenciaCurta, moeda, numero } from '@/lib/format'
import { Card, Grade, Tabela, Td, Th, Vazio, Etiqueta } from '@/components/ui'
import { escopoDe } from '@/components/SeletorEscopo'
import { CabecalhoPainel } from '@/components/CabecalhoArea'
import { CardComparativo, CardEvolucao } from '@/components/Paineis'

export const metadata = { title: 'Comodato' }

const TIPOS: [SerieCodigo, string][] = [['CO_ENTREGAS', 'Entregas'], ['CO_TROCAS', 'Trocas'], ['CO_RETIRADAS', 'Retiradas'], ['CO_SEM_EXITO', 'Sem êxito'], ['CO_FIM_ANO', 'Fim de ano']]

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler', 'COMODATO')
  const sp = await searchParams
  const comp = await competenciaSelecionada(sp.competencia)
  const escopo = escopoDe(sp.escopo)
  const meses3 = [somarMeses(comp, -2), somarMeses(comp, -1), comp]
  const [kpis, per, series, entregasEvo, posicao] = await Promise.all([
    calcularPainel(comp, escopo, { area: 'COMODATO' }, { usuarioId: u.id }),
    periodosDaCompetencia(comp),
    Promise.all(TIPOS.map(([c]) => lerSerie(c, meses3))),
    evolucao('CO_ENTREGAS', comp),
    q<{ produto: string; posicao_anterior: number; entradas: number; saidas_novos: number; saidas_usados: number; novos: number; usados: number; manutencao_interna: number | null; custo_total_novos: number | null; custo_total_usados: number | null; ajuste: number; origem: string }>(
      `select produto, posicao_anterior, entradas, saidas_novos, saidas_usados, novos, usados, manutencao_interna, custo_total_novos, custo_total_usados, ajuste, origem
         from comodato_posicao where competencia = $1 and excluido_em is null order by produto`, [comp]),
  ])
  const comparativo = {
    dados: TIPOS.map(([, rotulo], i) => ({ dimensao: rotulo, ...Object.fromEntries(meses3.map((m) => [m, series[i].porMes[m].valor])) })) as ({ dimensao: string } & Record<string, number | null>)[],
    meses: meses3.map((m) => ({ chave: m, rotulo: competenciaCurta(m), situacao: series[0].porMes[m].situacao })),
    totais: meses3.map((m) => series.reduce<number | null>((s, r) => (r.porMes[m].valor === null ? s : (s ?? 0) + (r.porMes[m].valor as number)), null)),
  }
  const tot = posicao.reduce((a, p) => ({ novos: a.novos + (p.custo_total_novos ?? 0), usados: a.usados + (p.custo_total_usados ?? 0) }), { novos: 0, usados: 0 })
  return (
    <div>
      <CabecalhoPainel titulo="Comodato" area="COMODATO" comp={comp} escopo={escopo} base="/comodato" periodo={per.find((p) => p.area === 'COMODATO')} kpis={kpis} />
      <Grade cols={2}>
        <CardComparativo titulo="Entregas, trocas e retiradas" c={comparativo} />
        <CardEvolucao titulo="Evolução mensal das entregas" dados={entregasEvo} />
      </Grade>
      <Card className="mt-4" titulo={`Posição do estoque de comodato — ${competenciaCurta(comp)}`}
        acoes={posicao.length > 0 && <span className="text-sm">Custo novos <strong>{moeda(tot.novos)}</strong> · usados <strong>{moeda(tot.usados)}</strong></span>}>
        {posicao.length === 0 ? <Vazio>Posição mensal não informada.</Vazio> : (
          <Tabela legenda="Posição do estoque de comodato">
            <thead><tr><Th>Produto</Th><Th alinhar="direita">Anterior</Th><Th alinhar="direita">Entradas</Th><Th alinhar="direita">Saídas novos</Th><Th alinhar="direita">Saídas usados</Th><Th alinhar="direita">Novos</Th><Th alinhar="direita">Usados</Th><Th alinhar="direita">Atual</Th><Th alinhar="direita">Manut. interna</Th><Th alinhar="direita">Custo novos</Th><Th alinhar="direita">Custo usados</Th><Th>Conciliação</Th></tr></thead>
            <tbody>
              {posicao.map((p) => (
                <tr key={p.produto}>
                  <Td className="font-semibold">{p.produto}</Td>
                  <Td alinhar="direita">{numero(p.posicao_anterior)}</Td><Td alinhar="direita">{numero(p.entradas)}</Td>
                  <Td alinhar="direita">{numero(p.saidas_novos)}</Td><Td alinhar="direita">{numero(p.saidas_usados)}</Td>
                  <Td alinhar="direita">{numero(p.novos)}</Td><Td alinhar="direita">{numero(p.usados)}</Td>
                  <Td alinhar="direita" className="font-bold">{numero(p.novos + p.usados)}</Td>
                  <Td alinhar="direita">{numero(p.manutencao_interna)}</Td>
                  <Td alinhar="direita">{moeda(p.custo_total_novos)}</Td><Td alinhar="direita">{moeda(p.custo_total_usados)}</Td>
                  <Td>{p.ajuste === 0 ? <Etiqueta tom="ok">✓ Conciliado</Etiqueta> : <Etiqueta tom="atencao">! Ajuste {numero(p.ajuste)}</Etiqueta>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <p className="mt-2 text-xs text-neutro">Posição atual = anterior + entradas − saídas; diferenças só com ajuste justificado e auditado.</p>
      </Card>
    </div>
  )
}
