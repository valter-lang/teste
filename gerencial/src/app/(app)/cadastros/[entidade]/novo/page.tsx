import { notFound } from 'next/navigation'
import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { Cabecalho, Card } from '@/components/ui'
import { entidadePorSlug } from '@/lib/cadastros/definicoes'
import { paramInteiro, type SearchParams } from '@/lib/filtros'
import { FormCadastro } from '../../_ui/FormCadastro'
import { carregarOpcoes } from '../../_ui/opcoes'
import { salvarCadastroAcao } from '../../acoes'

export default async function NovoCadastro({ params, searchParams }: { params: Promise<{ entidade: string }>; searchParams: SearchParams }) {
  await exigirPermissao('cadastros.editar')
  const { entidade } = await params
  const def = entidadePorSlug(entidade)
  if (!def) notFound()
  const sp = await searchParams
  // Pré-preenchimento de referências via URL (ex.: novo contrato a partir do cliente)
  const valores: Record<string, unknown> = {}
  for (const c of def.campos) if (c.tipo === 'referencia' && sp[c.nome]) valores[c.nome] = paramInteiro(sp[c.nome], 0) || null
  const opcoes = await carregarOpcoes(def, valores)
  if (def.slug === 'unidades' && opcoes.empresa_id?.length === 1) valores.empresa_id = opcoes.empresa_id[0].id
  const voltar = def.slug === 'contratos' && valores.cliente_id ? `/cadastros/clientes/${valores.cliente_id}` : `/cadastros/${def.slug}`
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm"><Link href={voltar} className="font-semibold text-vinho hover:underline">← Voltar</Link></p>
      <Cabecalho titulo={`Novo ${def.singular}`} subtitulo={def.descricao} />
      <Card>
        <FormCadastro
          campos={def.campos}
          valores={valores}
          opcoes={opcoes}
          acao={salvarCadastroAcao.bind(null, def.slug, null)}
          rotuloBotao="Criar cadastro"
          cancelarHref={voltar}
          voltar={def.slug === 'contratos' && valores.cliente_id ? `${voltar}?ok=contrato` : undefined}
        />
      </Card>
    </div>
  )
}
