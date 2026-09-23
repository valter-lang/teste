import { exigirPermissao } from '@/lib/auth/sessao'
import { pode, areasPermitidas } from '@/lib/auth/permissoes'
import { paramTexto, type SearchParams } from '@/lib/filtros'
import { definicoesVigentes } from '@/lib/indicadores/motor'
import { descreverMeta } from '@/lib/indicadores/status'
import { q } from '@/lib/db'
import { data, dataHora } from '@/lib/format'
import { Cabecalho, Card, Etiqueta, Selecao, Tabela, Td, Th, Botao } from '@/components/ui'
import { FormMeta, DecisaoMeta } from './Formularios'

export const metadata = { title: 'Metas' }
const TIPO: Record<string, string> = { ABSOLUTA: 'Absoluta', LINHA_BASE_MAIS: 'Linha de base + incremento', PERCENTUAL_SOBRE_LINHA_BASE: '% sobre linha de base', VARIACAO_PERIODO_ANTERIOR: 'Variação vs anterior', TENDENCIA_QUEDA: 'Tendência de queda', CONTAGEM_MINIMA: 'Contagem mínima' }

export default async function Metas({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('painel.ler')
  const ind = paramTexto((await searchParams).indicador)
  const defs = await definicoesVigentes(undefined, { incluirInativos: true })
  const metas = await q<{ id: number; indicador_codigo: string; versao: number; ciclo: string; tipo: string; operador: '>=' | '<=' | '=' | 'ENTRE'; valor: number | null; valor_max: number | null; linha_base: number | null; tolerancia_pct: number; vigencia_inicio: string; vigencia_fim: string | null; status: string; fonte_documento: string; motivo: string; aprovado_em: string | null; aprovador: string | null }>(
    `select m.id, m.indicador_codigo, m.versao, m.ciclo, m.tipo, m.operador, m.valor, m.valor_max, m.linha_base, m.tolerancia_pct, m.vigencia_inicio::text, m.vigencia_fim::text,
            m.status, m.fonte_documento, m.motivo, m.aprovado_em::text, u.nome aprovador
       from meta m left join usuario u on u.id = m.aprovado_por where ($1::text is null or m.indicador_codigo = $1)
      order by m.indicador_codigo, m.ciclo, m.versao desc`, [ind ?? null])
  const nome = (c: string) => defs.find((d) => d.codigo === c)?.nome ?? c
  const unidade = (c: string) => defs.find((d) => d.codigo === c)?.unidade_medida ?? ''
  const propostas = metas.filter((m) => m.status === 'PROPOSTA')
  const podePropor = areasPermitidas(u, 'metas.propor').length > 0
  return (
    <div>
      <Cabecalho titulo="Metas" subtitulo="Metas versionadas com vigência, aprovador e motivo. Metas trimestrais e semestrais mudam apenas na virada do ciclo, salvo exceção auditada." />
      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-sm font-semibold">Indicador<Selecao name="indicador" defaultValue={ind ?? ''} className="mt-1"><option value="">Todos</option>{defs.map((d) => <option key={d.codigo} value={d.codigo}>{d.nome}</option>)}</Selecao></label>
        <Botao variante="secundario">Filtrar</Botao>
      </form>
      {propostas.length > 0 && (
        <Card className="mb-4" titulo={`Propostas aguardando aprovação (${propostas.length})`}>
          <Tabela legenda="Propostas">
            <thead><tr><Th>Indicador</Th><Th>Ciclo</Th><Th>Meta proposta</Th><Th>Vigência</Th><Th>Documento</Th><Th>Motivo</Th><Th>Decisão</Th></tr></thead>
            <tbody>{propostas.map((m) => (
              <tr key={m.id}><Td>{nome(m.indicador_codigo)}</Td><Td>{m.ciclo}</Td>
                <Td>{TIPO[m.tipo]}: {m.valor === null ? 'pendente' : descreverMeta({ operador: m.operador, alvo: m.valor, alvoMax: m.valor_max, toleranciaPct: m.tolerancia_pct }, m.tipo === 'VARIACAO_PERIODO_ANTERIOR' ? '%' : unidade(m.indicador_codigo))}</Td>
                <Td>{data(m.vigencia_inicio)}</Td><Td className="text-xs">{m.fonte_documento}</Td><Td className="text-xs">{m.motivo}</Td>
                <Td>{pode(u, 'metas.aprovar') ? <DecisaoMeta id={m.id} /> : <Etiqueta tom="atencao">! Aguardando Diretoria</Etiqueta>}</Td></tr>
            ))}</tbody>
          </Tabela>
        </Card>
      )}
      <Card className="mb-4" titulo="Histórico de metas">
        <Tabela legenda="Metas">
          <thead><tr><Th>Indicador</Th><Th>Ciclo</Th><Th>Versão</Th><Th>Tipo</Th><Th>Meta</Th><Th>Tolerância</Th><Th>Vigência</Th><Th>Situação</Th><Th>Aprovação</Th></tr></thead>
          <tbody>{metas.filter((m) => m.status !== 'PROPOSTA').map((m) => (
            <tr key={m.id}>
              <Td>{nome(m.indicador_codigo)}</Td><Td>{m.ciclo}</Td><Td>v{m.versao}</Td><Td className="text-xs">{TIPO[m.tipo]}</Td>
              <Td>{m.tipo === 'TENDENCIA_QUEDA' ? 'Tendência de queda' : m.valor === null ? 'Pendente' : descreverMeta({ operador: m.operador, alvo: m.valor, alvoMax: m.valor_max, toleranciaPct: m.tolerancia_pct }, unidade(m.indicador_codigo))}{m.tipo === 'LINHA_BASE_MAIS' && ` (incremento; linha de base ${m.linha_base ?? 'pendente'})`}</Td>
              <Td>{m.tolerancia_pct}%</Td><Td>{data(m.vigencia_inicio)} – {m.vigencia_fim ? data(m.vigencia_fim) : 'atual'}</Td>
              <Td><Etiqueta tom={m.status === 'APROVADA' ? 'ok' : 'neutro'}>{m.status === 'APROVADA' ? '✓ Aprovada' : m.status === 'REJEITADA' ? 'Rejeitada' : 'Substituída'}</Etiqueta></Td>
              <Td className="text-xs">{m.aprovador ? `${m.aprovador} · ${dataHora(m.aprovado_em)}` : m.fonte_documento.startsWith('SEED:') ? 'Carga inicial do padrão (conferir com o documento original)' : '—'}</Td>
            </tr>
          ))}</tbody>
        </Tabela>
      </Card>
      {podePropor && <Card titulo="Propor nova meta ou nova versão"><FormMeta indicadores={defs.filter((d) => d.direcao !== 'INFORMATIVO').map((d) => ({ codigo: d.codigo, nome: d.nome }))} inicial={ind} /></Card>}
    </div>
  )
}
