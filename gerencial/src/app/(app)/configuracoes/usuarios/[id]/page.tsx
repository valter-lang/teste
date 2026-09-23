import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirPermissao } from '@/lib/auth/sessao'
import { AREAS, nomeArea } from '@/lib/auth/permissoes'
import { Alerta, Card, Campo, Entrada, Selecao, Tabela, Td, Th, Vazio, BotaoLink } from '@/components/ui'
import { obterUsuario, PAPEIS } from '@/lib/usuarios/servico'
import { q } from '@/lib/db'
import { dataHora } from '@/lib/format'
import { FormAcao } from '../../../cadastros/_ui/FormAcao'
import { AcaoRapida } from '../../../cadastros/_ui/AcaoRapida'
import { CabecalhoConfig } from '../../_abas'
import { EtiquetasUsuario } from '../etiquetas'
import {
  adicionarAtribuicaoAcao, ativoUsuarioAcao, atualizarUsuarioAcao, desbloquearUsuarioAcao, redefinirSenhaAcao, removerAtribuicaoAcao,
} from '../../acoes'

export default async function PaginaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const eu = await exigirPermissao('usuarios.gerir')
  const { id } = await params
  const alvo = await obterUsuario(id)
  if (!alvo) notFound()
  const unidades = await q<{ id: number; nome: string }>('select id, nome from unidade where ativo order by nome')
  const bloqueado = !!alvo.bloqueado_ate && new Date(alvo.bloqueado_ate) > new Date()
  const rotuloPapel = (p: string) => PAPEIS.find((x) => x.valor === p)?.rotulo ?? p

  return (
    <div>
      <CabecalhoConfig u={eu} ativo="usuarios" />
      <p className="mb-3 text-sm"><Link href="/configuracoes/usuarios" className="font-semibold text-vinho hover:underline">← Usuários</Link></p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold">{alvo.nome}</h2>
        <EtiquetasUsuario usuario={alvo} />
        {alvo.id === eu.id && <span className="text-xs text-neutro">(você)</span>}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card titulo="Dados de acesso">
          <FormAcao acao={atualizarUsuarioAcao} rotuloBotao="Salvar dados">
            <input type="hidden" name="id" value={alvo.id} />
            <Campo rotulo="Nome completo" nome="nome" obrigatorio><Entrada id="nome" name="nome" defaultValue={alvo.nome} required maxLength={120} /></Campo>
            <Campo rotulo="E-mail (login)" nome="email" obrigatorio><Entrada id="email" name="email" type="email" defaultValue={alvo.email} required maxLength={200} /></Campo>
          </FormAcao>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-neutro">Criado em</dt><dd>{dataHora(alvo.criado_em)}</dd>
            <dt className="text-neutro">Último acesso</dt><dd>{alvo.ultimo_login_em ? dataHora(alvo.ultimo_login_em) : 'Nunca'}</dd>
            <dt className="text-neutro">Tentativas falhas</dt><dd>{alvo.tentativas_falhas}</dd>
            <dt className="text-neutro">Bloqueado até</dt><dd>{bloqueado ? dataHora(alvo.bloqueado_ate) : 'Não bloqueado'}</dd>
          </dl>
        </Card>
        <Card titulo="Segurança">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-sm">Gera nova senha temporária (exibida uma única vez) e exige a troca no próximo acesso.</p>
              <AcaoRapida acao={redefinirSenhaAcao} campos={{ id: alvo.id }} rotulo="Redefinir senha" variante="secundario"
                confirmar={`Redefinir a senha de ${alvo.nome}? A senha atual deixará de funcionar.`} />
            </div>
            <div>
              <p className="mb-1 text-sm">Zera as tentativas falhas e remove o bloqueio temporário de login.</p>
              <AcaoRapida acao={desbloquearUsuarioAcao} campos={{ id: alvo.id }} rotulo="Desbloquear" variante="secundario" />
            </div>
            <div>
              <p className="mb-1 text-sm">{alvo.ativo ? 'Desativar impede o login; o histórico e a autoria dos registros são preservados.' : 'Reativar permite novamente o login.'}</p>
              <AcaoRapida acao={ativoUsuarioAcao} campos={{ id: alvo.id, ativo: String(!alvo.ativo) }}
                rotulo={alvo.ativo ? 'Desativar usuário' : 'Reativar usuário'} variante={alvo.ativo ? 'perigo' : 'primario'}
                confirmar={alvo.ativo ? `Desativar ${alvo.nome}?` : undefined} />
            </div>
          </div>
        </Card>
      </div>
      <Card titulo="Perfis e escopo" className="mt-5">
        <p className="mb-3 text-sm text-neutro">
          Cada atribuição combina perfil, área e unidade. Permissões administrativas (cadastros, usuários, configurações, auditoria) exigem perfil sem restrição de área.
          O sistema sempre mantém ao menos um Administrador ativo.
        </p>
        {alvo.atribuicoes.length === 0 ? <Vazio>Sem perfis: o usuário não acessa nenhuma área.</Vazio> : (
          <Tabela legenda="Atribuições de perfil">
            <thead><tr><Th>Perfil</Th><Th>Área</Th><Th>Unidade</Th><Th>Desde</Th><Th alinhar="direita">Ações</Th></tr></thead>
            <tbody>
              {alvo.atribuicoes.map((a) => (
                <tr key={a.id}>
                  <Td className="font-semibold">{rotuloPapel(a.papel)}</Td>
                  <Td>{a.area_codigo ? nomeArea(a.area_codigo) : 'Todas as áreas'}</Td>
                  <Td>{a.unidade_nome ?? 'Todas as unidades'}</Td>
                  <Td>{dataHora(a.criado_em)}</Td>
                  <Td alinhar="direita">
                    <AcaoRapida acao={removerAtribuicaoAcao} campos={{ papel_id: String(a.id) }} rotulo="Remover" variante="perigo"
                      rotuloAcessivel={`Remover perfil ${rotuloPapel(a.papel)}`} confirmar="Remover esta atribuição de perfil?" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <div className="mt-4 border-t border-pedra/60 pt-4">
          <h3 className="mb-2 text-sm font-bold">Adicionar atribuição</h3>
          <FormAcao acao={adicionarAtribuicaoAcao} rotuloBotao="Adicionar perfil" className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
            <input type="hidden" name="id" value={alvo.id} />
            <Campo rotulo="Perfil" nome="papel" obrigatorio>
              <Selecao id="papel" name="papel" required defaultValue="">
                <option value="" disabled>— selecione —</option>
                {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Área" nome="area">
              <Selecao id="area" name="area" defaultValue="*">
                <option value="*">Todas as áreas</option>
                {AREAS.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Unidade" nome="unidade">
              <Selecao id="unidade" name="unidade" defaultValue="*">
                <option value="*">Todas as unidades</option>
                {unidades.map((un) => <option key={un.id} value={un.id}>{un.nome}</option>)}
              </Selecao>
            </Campo>
          </FormAcao>
        </div>
        {alvo.atribuicoes.some((a) => a.papel === 'ADMIN' && a.area_codigo) && (
          <div className="mt-3"><Alerta tom="atencao">Atribuição de Administrador restrita a uma área não concede as permissões administrativas globais.</Alerta></div>
        )}
      </Card>
      <p className="mt-4 text-sm"><BotaoLink href={`/auditoria?tabela=usuario&registro_id=${alvo.id}`}>Histórico de alterações deste usuário</BotaoLink></p>
    </div>
  )
}
