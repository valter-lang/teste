import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { Cabecalho, Card, Etiqueta, Grade } from '@/components/ui'
import { ENTIDADES } from '@/lib/cadastros/definicoes'
import { contagensCadastros } from '@/lib/cadastros/servico'
import { numero } from '@/lib/format'

export const metadata = { title: 'Cadastros' }

export default async function PaginaCadastros() {
  const u = await exigirPermissao('dados.ler')
  const visiveis = ENTIDADES.filter((e) => !e.oculto)
  const contagens = await contagensCadastros(ENTIDADES)
  const editar = pode(u, 'cadastros.editar')
  return (
    <div>
      <Cabecalho
        titulo="Cadastros"
        subtitulo={editar
          ? 'Cadastros de apoio usados nos lançamentos e na importação. Desativar preserva o histórico; nada é excluído.'
          : 'Consulta dos cadastros de apoio. Alterações são feitas pelo Administrador.'}
      />
      <Grade cols={3}>
        {visiveis.map((e) => {
          const c = contagens[e.slug]
          const inativos = (c?.total ?? 0) - (c?.ativos ?? 0)
          return (
            <Link key={e.slug} href={`/cadastros/${e.slug}`} className="group rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-vinho">
              <Card className="h-full transition group-hover:border-vinho">
                <h2 className="text-base font-bold text-vinho group-hover:underline">{e.titulo}</h2>
                <p className="mt-1 text-sm text-neutro">{e.descricao}</p>
                <p className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Etiqueta tom="ok">{numero(c?.ativos ?? 0)} ativo(s)</Etiqueta>
                  {inativos > 0 && <Etiqueta>{numero(inativos)} desativado(s)</Etiqueta>}
                </p>
              </Card>
            </Link>
          )
        })}
      </Grade>
    </div>
  )
}
