import { exigirPermissao } from '@/lib/auth/sessao'
import { Abas, Botao, BotaoLink, Cabecalho, Card, Entrada, Etiqueta, Paginacao, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { listarAuditoria, listarEventosSistema, tabelasAuditadas, usuariosParaFiltro } from '@/lib/cadastros/auditoria'
import { diferencasAuditoria, mascararDadosPessoais, valorCurto } from '@/lib/cadastros/auditoria-diff'

export const metadata = { title: 'Trilha de auditoria' }

const OPERACOES: Record<string, { rotulo: string; tom: 'ok' | 'atencao' | 'critico' }> = {
  INSERT: { rotulo: '+ Inclusão', tom: 'ok' },
  UPDATE: { rotulo: '✎ Alteração', tom: 'atencao' },
  DELETE: { rotulo: '✖ Exclusão', tom: 'critico' },
}

const ROTULOS_EVENTO: Record<string, string> = {
  LOGIN: 'Login', USUARIO_CRIADO: 'Usuário criado', USUARIO_DESATIVADO: 'Usuário desativado', USUARIO_REATIVADO: 'Usuário reativado',
  USUARIO_SENHA_REDEFINIDA: 'Senha redefinida', USUARIO_DESBLOQUEADO: 'Usuário desbloqueado', USUARIO_PERFIL_ATRIBUIDO: 'Perfil atribuído',
  USUARIO_PERFIL_REMOVIDO: 'Perfil removido',
}

export default async function PaginaAuditoria({ searchParams }: { searchParams: SearchParams }) {
  await exigirPermissao('auditoria.ler')
  const sp = await searchParams
  const aba = paramTexto(sp.aba) === 'eventos' ? 'eventos' : 'trilha'
  const f = {
    tabela: paramTexto(sp.tabela), de: paramTexto(sp.de), ate: paramTexto(sp.ate), usuarioId: paramTexto(sp.usuario),
    operacao: paramTexto(sp.operacao), registroId: paramTexto(sp.registro_id), tipo: paramTexto(sp.tipo), pagina: paramInteiro(sp.pagina, 1),
  }
  const usuarios = await usuariosParaFiltro()
  const href = (p: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ aba: aba === 'eventos' ? 'eventos' : undefined, tabela: f.tabela, de: f.de, ate: f.ate, usuario: f.usuarioId, operacao: f.operacao, registro_id: f.registroId, tipo: f.tipo })) {
      if (v) q.set(k, v)
    }
    if (p > 1) q.set('pagina', String(p))
    return `/auditoria${q.size ? '?' + q : ''}`
  }

  return (
    <div>
      <Cabecalho titulo="Trilha de auditoria" subtitulo="Quem alterou o quê e quando. Registros somente inclusão; dados pessoais (e-mails, senhas) nunca são exibidos." />
      <Abas ativo={aba} itens={[
        { id: 'trilha', rotulo: 'Alterações de dados', href: '/auditoria' },
        { id: 'eventos', rotulo: 'Eventos do sistema', href: '/auditoria?aba=eventos' },
      ]} />
      {aba === 'trilha' ? <Trilha f={f} usuarios={usuarios} href={href} /> : <Eventos f={f} usuarios={usuarios} href={href} />}
    </div>
  )
}

type Filtros = { tabela?: string; de?: string; ate?: string; usuarioId?: string; operacao?: string; registroId?: string; tipo?: string; pagina: number }

function CamposPeriodoUsuario({ f, usuarios, sistema }: { f: Filtros; usuarios: { id: string; nome: string }[]; sistema?: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="de" className="text-sm font-semibold">De</label>
        <Entrada id="de" name="de" type="date" defaultValue={f.de} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ate" className="text-sm font-semibold">Até</label>
        <Entrada id="ate" name="ate" type="date" defaultValue={f.ate} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="usuario" className="text-sm font-semibold">Usuário</label>
        <Selecao id="usuario" name="usuario" defaultValue={f.usuarioId ?? ''}>
          <option value="">Todos</option>
          {sistema && <option value="sistema">Sistema (sem usuário)</option>}
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </Selecao>
      </div>
    </>
  )
}

async function Trilha({ f, usuarios, href }: { f: Filtros; usuarios: { id: string; nome: string }[]; href: (p: number) => string }) {
  const [tabelas, { linhas, total, porPagina }] = await Promise.all([tabelasAuditadas(), listarAuditoria(f)])
  return (
    <Card>
      <form method="get" role="search" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="flex flex-col gap-1">
          <label htmlFor="tabela" className="text-sm font-semibold">Tabela</label>
          <Selecao id="tabela" name="tabela" defaultValue={f.tabela ?? ''}>
            <option value="">Todas</option>
            {tabelas.map((t) => <option key={t} value={t}>{t}</option>)}
          </Selecao>
        </div>
        <CamposPeriodoUsuario f={f} usuarios={usuarios} sistema />
        <div className="flex flex-col gap-1">
          <label htmlFor="operacao" className="text-sm font-semibold">Operação</label>
          <Selecao id="operacao" name="operacao" defaultValue={f.operacao ?? ''}>
            <option value="">Todas</option>
            <option value="INSERT">Inclusão</option>
            <option value="UPDATE">Alteração</option>
            <option value="DELETE">Exclusão</option>
          </Selecao>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="registro_id" className="text-sm font-semibold">ID do registro</label>
          <Entrada id="registro_id" name="registro_id" defaultValue={f.registroId} />
        </div>
        <div className="flex gap-2">
          <Botao type="submit" variante="secundario">Filtrar</Botao>
          <BotaoLink href="/auditoria" variante="fantasma">Limpar</BotaoLink>
        </div>
      </form>
      {linhas.length === 0 ? <Vazio>Nenhum registro de auditoria para os filtros informados.</Vazio> : (
        <Tabela legenda="Trilha de auditoria">
          <thead><tr><Th>Quando</Th><Th>Quem</Th><Th>Operação</Th><Th>Tabela / registro</Th><Th>Campos (antes → depois)</Th></tr></thead>
          <tbody>
            {linhas.map((l) => {
              const difs = diferencasAuditoria(l.antes, l.depois)
              const op = OPERACOES[l.operacao] ?? { rotulo: l.operacao, tom: 'atencao' as const }
              const ctx = l.contexto ? (mascararDadosPessoais(l.contexto) as Record<string, unknown>) : null
              return (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap">{dataHora(l.em)}</Td>
                  <Td>{l.usuario_nome ?? <span className="text-neutro">Sistema</span>}</Td>
                  <Td><Etiqueta tom={op.tom}>{op.rotulo}</Etiqueta></Td>
                  <Td>
                    <code className="text-xs">{l.tabela}</code>
                    {l.registro_id && <> · <a className="text-xs font-semibold text-vinho hover:underline" href={`/auditoria?tabela=${encodeURIComponent(l.tabela)}&registro_id=${encodeURIComponent(l.registro_id)}`}>#{l.registro_id.length > 12 ? l.registro_id.slice(0, 8) + '…' : l.registro_id}</a></>}
                    {ctx && <p className="mt-1 text-xs text-neutro">Contexto: {valorCurto(ctx, 80)}</p>}
                  </Td>
                  <Td>
                    {difs.length === 0 ? <span className="text-neutro">Sem mudança visível</span> : (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-vinho">{difs.length} campo(s): {difs.slice(0, 4).map((d) => d.campo).join(', ')}{difs.length > 4 ? '…' : ''}</summary>
                        <table className="mt-2 w-full text-xs">
                          <caption className="sr-only">Diferenças do registro</caption>
                          <thead><tr><th scope="col" className="pr-2 text-left">Campo</th><th scope="col" className="pr-2 text-left">Antes</th><th scope="col" className="text-left">Depois</th></tr></thead>
                          <tbody>
                            {difs.map((d) => (
                              <tr key={d.campo} className="border-t border-pedra/40">
                                <td className="pr-2 font-mono">{d.campo}</td>
                                <td className="pr-2 text-critico">{d.antes === undefined ? '—' : <del>{valorCurto(d.antes)}</del>}</td>
                                <td className="text-ok">{d.depois === undefined ? '—' : <ins className="no-underline">{valorCurto(d.depois)}</ins>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Tabela>
      )}
      <Paginacao pagina={f.pagina} total={total} porPagina={porPagina} hrefPara={href} />
    </Card>
  )
}

async function Eventos({ f, usuarios, href }: { f: Filtros; usuarios: { id: string; nome: string }[]; href: (p: number) => string }) {
  const { linhas, total, porPagina, tipos } = await listarEventosSistema(f)
  return (
    <Card>
      <form method="get" role="search" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="aba" value="eventos" />
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo" className="text-sm font-semibold">Tipo de evento</label>
          <Selecao id="tipo" name="tipo" defaultValue={f.tipo ?? ''}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{ROTULOS_EVENTO[t] ?? t}</option>)}
          </Selecao>
        </div>
        <CamposPeriodoUsuario f={f} usuarios={usuarios} />
        <div className="flex gap-2">
          <Botao type="submit" variante="secundario">Filtrar</Botao>
          <BotaoLink href="/auditoria?aba=eventos" variante="fantasma">Limpar</BotaoLink>
        </div>
      </form>
      {linhas.length === 0 ? <Vazio>Nenhum evento para os filtros informados.</Vazio> : (
        <Tabela legenda="Eventos do sistema (logins, exportações, reaberturas)">
          <thead><tr><Th>Quando</Th><Th>Evento</Th><Th>Usuário</Th><Th>Detalhes</Th></tr></thead>
          <tbody>
            {linhas.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{dataHora(e.em)}</Td>
                <Td><span className="font-semibold">{ROTULOS_EVENTO[e.tipo] ?? e.tipo}</span></Td>
                <Td>{e.usuario_nome ?? <span className="text-neutro">Sistema</span>}</Td>
                <Td className="text-xs">
                  {e.alvo_nome && <p>Usuário afetado: <strong>{e.alvo_nome}</strong></p>}
                  {e.detalhes && Object.keys(e.detalhes).filter((k) => k !== 'usuario_alvo').length
                    ? valorCurto(mascararDadosPessoais(Object.fromEntries(Object.entries(e.detalhes).filter(([k]) => k !== 'usuario_alvo'))), 200)
                    : !e.alvo_nome && '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
      <Paginacao pagina={f.pagina} total={total} porPagina={porPagina} hrefPara={href} />
    </Card>
  )
}
