import { exigirPermissao } from '@/lib/auth/sessao'
import { BotaoLink, Botao, Card, Campo, Entrada, Etiqueta, Paginacao, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { listarUsuarios } from '@/lib/usuarios/servico'
import { paramInteiro, paramTexto, type SearchParams } from '@/lib/filtros'
import { dataHora } from '@/lib/format'
import { FormAcao } from '../../cadastros/_ui/FormAcao'
import { CabecalhoConfig } from '../_abas'
import { criarUsuarioAcao } from '../acoes'
import { EtiquetasUsuario } from './etiquetas'

export const metadata = { title: 'Usuários' }

export default async function PaginaUsuarios({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('usuarios.gerir')
  const sp = await searchParams
  const busca = paramTexto(sp.busca)
  const st = paramTexto(sp.status)
  const status = st === 'ativos' || st === 'inativos' ? st : 'todos'
  const pagina = paramInteiro(sp.pagina, 1)
  const { linhas, total, porPagina } = await listarUsuarios({ busca, pagina, status })
  const href = (p: number) => {
    const q = new URLSearchParams()
    if (busca) q.set('busca', busca)
    if (status !== 'todos') q.set('status', status)
    if (p > 1) q.set('pagina', String(p))
    return `/configuracoes/usuarios${q.size ? '?' + q : ''}`
  }
  return (
    <div>
      <CabecalhoConfig u={u} ativo="usuarios" subtitulo="Acesso ao sistema, perfis por área/unidade, bloqueios e senhas temporárias." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_22rem]">
        <Card titulo="Usuários">
          <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <label htmlFor="busca" className="text-sm font-semibold">Pesquisar</label>
              <Entrada id="busca" name="busca" defaultValue={busca} placeholder="Nome ou e-mail" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="status" className="text-sm font-semibold">Situação</label>
              <Selecao id="status" name="status" defaultValue={status}>
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Desativados</option>
              </Selecao>
            </div>
            <Botao type="submit" variante="secundario">Filtrar</Botao>
          </form>
          {linhas.length === 0 ? <Vazio>Nenhum usuário encontrado.</Vazio> : (
            <Tabela legenda="Usuários do sistema">
              <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfis</Th><Th>Situação</Th><Th>Último acesso</Th><Th alinhar="direita">Ações</Th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={l.ativo ? '' : 'text-neutro'}>
                    <Td className="font-semibold">{l.nome}</Td>
                    <Td>{l.email}</Td>
                    <Td>{l.papeis ?? <Etiqueta tom="atencao">! Sem perfil</Etiqueta>}</Td>
                    <Td><EtiquetasUsuario usuario={l} /></Td>
                    <Td>{l.ultimo_login_em ? dataHora(l.ultimo_login_em) : 'Nunca'}</Td>
                    <Td alinhar="direita"><BotaoLink href={`/configuracoes/usuarios/${l.id}`} className="px-2.5 py-1 text-xs" aria-label={`Gerenciar ${l.nome}`}>Gerenciar</BotaoLink></Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <Paginacao pagina={pagina} total={total} porPagina={porPagina} hrefPara={href} />
        </Card>
        <Card titulo="Novo usuário">
          <FormAcao acao={criarUsuarioAcao} rotuloBotao="Criar usuário">
            <Campo rotulo="Nome completo" nome="nome" obrigatorio><Entrada id="nome" name="nome" required maxLength={120} autoComplete="off" /></Campo>
            <Campo rotulo="E-mail" nome="email" obrigatorio><Entrada id="email" name="email" type="email" required maxLength={200} autoComplete="off" /></Campo>
            <p className="text-xs text-neutro">Uma senha temporária aleatória será gerada e exibida uma única vez. O usuário deverá trocá-la no primeiro acesso.</p>
          </FormAcao>
        </Card>
      </div>
    </div>
  )
}
