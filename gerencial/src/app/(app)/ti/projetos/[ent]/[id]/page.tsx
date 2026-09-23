import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { BotaoLink, Card, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { entidadePorSegmento } from '@/lib/operacao/entidades'
import type { Registro } from '@/lib/operacao/crud'
import { marcosDoProjeto } from '@/lib/operacao/ti'
import { data, numero } from '@/lib/format'
import type { SearchParams } from '@/lib/filtros'

export const metadata = { title: 'Projetos e entregas' }

async function Marcos({ reg, podeEditar }: { reg: Registro; podeEditar: boolean }) {
  const marcos = await marcosDoProjeto(reg.id)
  return (
    <Card titulo="Marcos do projeto" acoes={podeEditar && !reg.excluido_em ? <BotaoLink href={`/ti/projetos/marcos/novo?projeto=${reg.id}`}>Incluir marco</BotaoLink> : undefined}>
      {marcos.length === 0 ? <Vazio>Nenhum marco cadastrado.</Vazio> : (
        <Tabela legenda="Marcos do projeto">
          <thead><tr><Th>Marco</Th><Th>Planejado</Th><Th>Realizado</Th><Th alinhar="direita">% concluído</Th><Th alinhar="direita">Desvio</Th></tr></thead>
          <tbody>
            {marcos.map((m) => (
              <tr key={m.id}>
                <Td><Link className="font-semibold text-vinho underline" href={`/ti/projetos/marcos/${m.id}`}>{m.descricao}</Link></Td>
                <Td>{data(m.data_planejada)}</Td>
                <Td>{data(m.data_realizada)}</Td>
                <Td alinhar="direita">{numero(m.percentual_concluido, 0)}%</Td>
                <Td alinhar="direita">
                  {m.desvio_dias > 0
                    ? <Etiqueta tom="critico">▲ {m.desvio_dias} dia(s) de atraso{m.data_realizada ? '' : ' (pendente)'}</Etiqueta>
                    : <Etiqueta tom="ok">✓ No prazo</Etiqueta>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Card>
  )
}

export default async function Pagina({ params, searchParams }: { params: Promise<{ ent: string; id: string }>; searchParams: SearchParams }) {
  const { ent, id } = await params
  const def = entidadePorSegmento('/ti/projetos', ent)
  if (!def?.segmento) notFound()
  return <PaginaRegistro def={def} id={id} searchParams={searchParams}
    extras={def.chave === 'ti_projeto' ? (reg, ctx) => <Marcos reg={reg} podeEditar={ctx.podeEditar} /> : undefined} />
}
