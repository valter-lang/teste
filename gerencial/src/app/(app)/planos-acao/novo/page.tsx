import { exigirPermissao } from '@/lib/auth/sessao'
import { areasPermitidas, AREAS } from '@/lib/auth/permissoes'
import { definicoesVigentes } from '@/lib/indicadores/motor'
import { paramTexto, type SearchParams } from '@/lib/filtros'
import { Cabecalho, Card } from '@/components/ui'
import { FormPlano } from '../FormPlano'

export const metadata = { title: 'Novo plano de ação' }

export default async function Novo({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('plano.editar')
  const sp = await searchParams
  const areas = AREAS.filter((a) => areasPermitidas(u, 'plano.editar').includes(a.codigo))
  const defs = await definicoesVigentes(undefined, { classes: ['ESSENCIAL', 'COMPLEMENTAR', 'OPERACIONAL'] })
  const hoje = new Date().toISOString().slice(0, 10)
  const area = paramTexto(sp.area) ?? areas[0]?.codigo
  return (
    <div className="max-w-4xl">
      <Cabecalho titulo="Novo plano de ação" />
      <Card>
        <FormPlano areas={areas} indicadores={defs.map((d) => ({ codigo: d.codigo, nome: `${d.nome} (${AREAS.find((a) => a.codigo === d.area_codigo)?.nome})`, area: d.area_codigo }))}
          v={{ area_codigo: area, indicador_codigo: paramTexto(sp.indicador), competencia_origem: paramTexto(sp.competencia), inicio: hoje, criticidade: 'ALTA' }} />
      </Card>
    </div>
  )
}
