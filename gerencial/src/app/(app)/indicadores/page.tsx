import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { nomeArea } from '@/lib/auth/permissoes'
import { definicoesVigentes } from '@/lib/indicadores/motor'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { Cabecalho, Card, Etiqueta, Tabela, Td, Th } from '@/components/ui'

export const metadata = { title: 'Catálogo de indicadores' }

const CLASSE: Record<string, { r: string; t: 'vinho' | 'dourado' | 'neutro' | 'atencao' }> = {
  ESSENCIAL: { r: 'Essencial', t: 'vinho' }, COMPLEMENTAR: { r: 'Complementar', t: 'dourado' },
  OPERACIONAL: { r: 'Operacional', t: 'neutro' }, CANDIDATO: { r: 'Candidato (desativado)', t: 'atencao' },
}
const CONSOL: Record<string, string> = { FOTOGRAFIA: 'Fotografia', SOMA: 'Soma', MEDIA_SIMPLES: 'Média simples', MEDIA_PONDERADA: 'Média ponderada', ULTIMO_VALOR: 'Último valor', TAXA_CONTAGEM: 'Taxa + contagem' }

export default async function Catalogo({ searchParams }: { searchParams: SearchParams }) {
  await exigirPermissao('painel.ler')
  const comp = await competenciaSelecionada((await searchParams).competencia)
  const defs = await definicoesVigentes(undefined, { incluirInativos: true })
  return (
    <div>
      <Cabecalho titulo="Catálogo de indicadores" subtitulo="Definições versionadas: fórmula, origem, consolidação, direção da meta e situação de homologação." />
      <Card>
        <Tabela legenda="Indicadores">
          <thead><tr><Th>Código</Th><Th>Indicador</Th><Th>Área</Th><Th>Classe</Th><Th>Unidade</Th><Th>Consolidação</Th><Th>Fórmula</Th><Th>Homologação</Th></tr></thead>
          <tbody>
            {defs.map((d) => (
              <tr key={d.codigo}>
                <Td className="font-mono text-xs">{d.codigo}</Td>
                <Td><Link className="font-semibold text-vinho hover:underline" href={`/indicadores/${d.codigo}?competencia=${comp}`}>{d.nome}</Link></Td>
                <Td>{nomeArea(d.area_codigo)}</Td>
                <Td><Etiqueta tom={CLASSE[d.classe].t}>{CLASSE[d.classe].r}</Etiqueta></Td>
                <Td>{d.unidade_medida}</Td>
                <Td>{CONSOL[d.consolidacao]}</Td>
                <Td className="max-w-md text-xs">{d.formula}</Td>
                <Td>{d.homologado ? <Etiqueta tom="ok">✓ Homologado</Etiqueta> : <Etiqueta tom="atencao">! Pendente</Etiqueta>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Card>
    </div>
  )
}
