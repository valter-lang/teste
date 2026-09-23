import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, nomeArea, pode } from '@/lib/auth/permissoes'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { q, q1 } from '@/lib/db'
import { data } from '@/lib/format'
import { ROTULO_STATUS_PLANO } from '@/lib/planos'
import { BotaoLink, Cabecalho, Card, Entrada, Etiqueta, Paginacao, Selecao, Tabela, Td, Th, Vazio, Botao } from '@/components/ui'

export const metadata = { title: 'Planos de ação' }
const POR_PAGINA = 50

export default async function Planos({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('painel.ler')
  const sp = await searchParams
  const f = { area: paramTexto(sp.area), situacao: paramTexto(sp.situacao) ?? 'abertos', resp: paramTexto(sp.responsavel), crit: paramTexto(sp.criticidade) }
  const pagina = paramInteiro(sp.pagina, 1)
  const cond = `($1::text is null or area_codigo = $1) and ($2::text is null or responsavel_nome ilike '%' || $2 || '%') and ($3::text is null or criticidade = $3)
    and (case $4 when 'abertos' then status in ('ABERTA','EM_ANDAMENTO','AGUARDANDO_EFICACIA')
                 when 'vencidas' then status in ('ABERTA','EM_ANDAMENTO') and prazo < current_date
                 when 'a_vencer' then status in ('ABERTA','EM_ANDAMENTO') and prazo between current_date and current_date + 7
                 when 'encerrados' then status in ('ENCERRADA','CANCELADA') else true end)`
  const params = [f.area ?? null, f.resp ?? null, f.crit ?? null, f.situacao]
  const [linhas, total] = await Promise.all([
    q<{ id: number; codigo: string; area_codigo: string; indicador_codigo: string | null; ocorrencia: string | null; acao: string; responsavel_nome: string; prazo: string; status: string; criticidade: string; vencido: boolean }>(
      `select id, codigo, area_codigo, indicador_codigo, ocorrencia, acao, responsavel_nome, prazo::text, status, criticidade,
              (prazo < current_date and status in ('ABERTA','EM_ANDAMENTO')) vencido
         from plano_acao where ${cond} order by vencido desc, prazo limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`, params),
    q1<{ n: number }>(`select count(*)::int n from plano_acao where ${cond}`, params),
  ])
  const qs = (p: number) => `/planos-acao?${new URLSearchParams(Object.entries({ area: f.area, situacao: f.situacao, responsavel: f.resp, criticidade: f.crit, pagina: String(p) }).filter(([, v]) => v) as [string, string][])}`
  return (
    <div>
      <Cabecalho titulo="Planos de ação" subtitulo="Todo indicador fora da meta exige plano com causa raiz, ação objetiva, responsável e prazo."
        acoes={pode(u, 'plano.editar') && <BotaoLink variante="primario" href="/planos-acao/novo">Novo plano</BotaoLink>} />
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
          <label className="text-sm font-semibold">Área<Selecao name="area" defaultValue={f.area ?? ''} className="mt-1"><option value="">Todas</option>{AREAS.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}</Selecao></label>
          <label className="text-sm font-semibold">Situação<Selecao name="situacao" defaultValue={f.situacao} className="mt-1">
            <option value="abertos">Em aberto</option><option value="vencidas">Vencidas</option><option value="a_vencer">Vencem em 7 dias</option><option value="encerrados">Encerradas/canceladas</option><option value="todos">Todas</option></Selecao></label>
          <label className="text-sm font-semibold">Responsável<Entrada name="responsavel" defaultValue={f.resp ?? ''} className="mt-1" /></label>
          <label className="text-sm font-semibold">Criticidade<Selecao name="criticidade" defaultValue={f.crit ?? ''} className="mt-1"><option value="">Todas</option><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option></Selecao></label>
          <div className="flex items-end"><Botao type="submit" variante="secundario">Filtrar</Botao></div>
        </form>
      </Card>
      <Card>
        {linhas.length === 0 ? <Vazio>Nenhum plano encontrado com os filtros.</Vazio> : (
          <Tabela legenda="Planos de ação">
            <thead><tr><Th>Código</Th><Th>Área</Th><Th>Origem</Th><Th>Ação</Th><Th>Responsável</Th><Th>Prazo</Th><Th>Criticidade</Th><Th>Status</Th></tr></thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="font-semibold text-vinho hover:underline" href={`/planos-acao/${p.id}`}>{p.codigo}</Link></Td>
                  <Td>{nomeArea(p.area_codigo)}</Td>
                  <Td className="text-xs">{p.indicador_codigo ?? p.ocorrencia}</Td>
                  <Td className="max-w-sm">{p.acao}</Td>
                  <Td>{p.responsavel_nome}</Td>
                  <Td>{p.vencido ? <Etiqueta tom="critico">▲ Vencida {data(p.prazo)}</Etiqueta> : data(p.prazo)}</Td>
                  <Td>{{ ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }[p.criticidade]}</Td>
                  <Td><Etiqueta tom={p.status === 'ENCERRADA' ? 'ok' : p.status === 'CANCELADA' ? 'neutro' : 'dourado'}>{ROTULO_STATUS_PLANO[p.status]}</Etiqueta></Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <Paginacao pagina={pagina} total={total?.n ?? 0} porPagina={POR_PAGINA} hrefPara={qs} />
      </Card>
    </div>
  )
}
