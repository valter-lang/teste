import clsx from 'clsx'
import { exigirLogin } from '@/lib/auth/sessao'
import { nomeArea, pode, type AreaCodigo } from '@/lib/auth/permissoes'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { competenciaCurta, numero } from '@/lib/format'
import { validarCompetencia } from '@/lib/competencia'
import { AbasArea } from '@/components/AbasArea'
import { Alerta, Botao, Cabecalho, Card, Paginacao, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { anosHistorico, listarDetalhes, pivotHistorico, seriesHistorico, tiposDetalhe } from '@/lib/operacao/historico'

const ROTAS: Record<string, string> = {
  MANUT_INTERNA: '/manutencao-interna/historico',
  MANUT_EXTERNA: '/manutencao-externa/historico',
  ESTOQUE_PECAS: '/estoque-pecas/historico',
  COMODATO: '/comodato/historico',
}

const qs = (p: Record<string, string | undefined>) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v)
  return u.toString() ? `?${u}` : ''
}
const casas = (v: number) => (Number.isInteger(v) ? 0 : 2)

/** Histórico migrado da planilha (somente leitura), com origem aba/célula de cada valor. */
export async function PaginaHistorico({ area, searchParams }: { area: AreaCodigo; searchParams: SearchParams }) {
  const u = await exigirLogin()
  const titulo = `Histórico migrado — ${nomeArea(area)}`
  if (!pode(u, 'dados.ler', area)) return <><Cabecalho titulo={titulo} /><Alerta tom="critico">Acesso negado para o seu perfil.</Alerta></>
  const sp = await searchParams
  const rota = ROTAS[area]
  const series = await seriesHistorico(area)
  const serie = series.find((s) => s.serie === paramTexto(sp.serie))?.serie ?? series[0]?.serie
  const anos = serie ? await anosHistorico(area, serie) : []
  const ano = anos.includes(paramInteiro(sp.ano, 0)) ? paramInteiro(sp.ano, 0) : anos[0]
  const mostrarOrigem = sp.origem === '1'
  const pivot = serie && ano ? await pivotHistorico(area, serie, ano) : null

  const tipos = await tiposDetalhe(area)
  const tipo = tipos.find((t) => t.tipo === paramTexto(sp.tipo))?.tipo
  const compDet = paramTexto(sp.comp_detalhe)
  const paginaDet = paramInteiro(sp.pagina, 1)
  const detalhes = tipos.length
    ? await listarDetalhes(area, { tipo, competencia: compDet && validarCompetencia(compDet) ? compDet : undefined, pagina: paginaDet, porPagina: 50 })
    : null
  const atuais = { serie, ano: ano ? String(ano) : undefined, origem: mostrarOrigem ? '1' : undefined, tipo, comp_detalhe: compDet }

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo={titulo} subtitulo="Séries mensais importadas da planilha (anteriores à data de corte da migração). Somente leitura; cada valor mantém a aba e a célula de origem." />
      <AbasArea area={area} ativo="historico" />

      {series.length === 0 ? (
        <Vazio>Nenhuma série histórica migrada para esta área.</Vazio>
      ) : (
        <Card titulo="Séries agregadas">
          <form method="get" action={rota} className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Filtros do histórico">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Série
              <Selecao name="serie" defaultValue={serie} className="py-1.5">
                {series.map((s) => <option key={s.serie} value={s.serie}>{s.serie} ({competenciaCurta(s.inicio)} a {competenciaCurta(s.fim)})</option>)}
              </Selecao>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Ano
              <Selecao name="ano" defaultValue={ano ? String(ano) : ''} className="py-1.5">
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </Selecao>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" name="origem" value="1" defaultChecked={mostrarOrigem} /> Mostrar aba/célula de origem
            </label>
            <Botao type="submit" variante="secundario" className="py-1.5">Aplicar</Botao>
          </form>
          {!pivot || pivot.linhas.length === 0 ? (
            <Vazio>Sem valores para a série no ano selecionado.</Vazio>
          ) : (
            <Tabela legenda={`Série ${serie} em ${ano}`}>
              <thead>
                <tr>
                  <Th>{pivot.linhas[0]?.dimensaoTipo ? pivot.linhas[0].dimensaoTipo.replaceAll('_', ' ').toLowerCase() : 'Dimensão'}</Th>
                  {pivot.competencias.map((c) => <Th key={c} alinhar="direita">{competenciaCurta(c)}</Th>)}
                  <Th alinhar="direita">Total</Th>
                </tr>
              </thead>
              <tbody>
                {pivot.linhas.map((l) => (
                  <tr key={l.dimensao}>
                    <Td className="font-semibold">{l.dimensao}</Td>
                    {pivot.competencias.map((c) => {
                      const cel = l.valores[c]
                      return (
                        <Td key={c} alinhar="direita" className={clsx(!cel && 'text-neutro italic')}>
                          {cel ? (
                            <span title={`Origem: ${cel.aba}!${cel.celula}`}>
                              {numero(cel.valor, casas(cel.valor))}
                              {mostrarOrigem && <span className="block text-[10px] text-neutro">{cel.aba}!{cel.celula}</span>}
                            </span>
                          ) : '—'}
                        </Td>
                      )
                    })}
                    <Td alinhar="direita" className="font-bold">{numero(l.total, casas(l.total))}</Td>
                  </tr>
                ))}
                {pivot.linhas.length > 1 && (
                  <tr className="bg-creme font-bold">
                    <Td>Total (soma)</Td>
                    {pivot.competencias.map((c) => <Td key={c} alinhar="direita">{pivot.totais[c] != null ? numero(pivot.totais[c], casas(pivot.totais[c])) : '—'}</Td>)}
                    <Td alinhar="direita">{numero(pivot.totalGeral, casas(pivot.totalGeral))}</Td>
                  </tr>
                )}
              </tbody>
            </Tabela>
          )}
          <p className="mt-2 text-xs text-neutro">“—” = sem valor na planilha (não significa zero). Totais somam as linhas; para séries de percentual ou média, interprete com cautela.</p>
        </Card>
      )}

      {detalhes && (
        <Card titulo="Registros detalhados migrados">
          <form method="get" action={rota} className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Filtros dos registros detalhados">
            {serie && <input type="hidden" name="serie" value={serie} />}
            {ano && <input type="hidden" name="ano" value={ano} />}
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Tipo
              <Selecao name="tipo" defaultValue={tipo ?? ''} className="py-1.5">
                <option value="">Todos</option>
                {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{t.tipo} ({t.registros})</option>)}
              </Selecao>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Competência (aaaa-mm-01)
              <input name="comp_detalhe" defaultValue={compDet ?? ''} pattern="\d{4}-\d{2}-01" className="rounded-md border border-pedra px-3 py-1.5 text-sm" />
            </label>
            <Botao type="submit" variante="secundario" className="py-1.5">Filtrar</Botao>
          </form>
          {detalhes.linhas.length === 0 ? <Vazio>Nenhum registro detalhado.</Vazio> : (
            <Tabela legenda="Registros detalhados migrados">
              <thead><tr><Th>Competência</Th><Th>Tipo</Th><Th>Dados</Th><Th>Origem (aba/faixa)</Th></tr></thead>
              <tbody>
                {detalhes.linhas.map((d) => (
                  <tr key={d.id}>
                    <Td>{competenciaCurta(d.competencia)}</Td>
                    <Td>{d.tipo}</Td>
                    <Td>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
                        {Object.entries(d.dados).map(([k, v]) => (
                          <div key={k} className="contents"><dt className="text-neutro">{k}</dt><dd>{v == null || v === '' ? 'Não informado' : String(v)}</dd></div>
                        ))}
                      </dl>
                    </Td>
                    <Td className="text-xs">{d.aba}!{d.faixa}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <Paginacao pagina={paginaDet} total={detalhes.total} porPagina={50} hrefPara={(p) => `${rota}${qs({ ...atuais, pagina: String(p) })}`} />
        </Card>
      )}
    </div>
  )
}
