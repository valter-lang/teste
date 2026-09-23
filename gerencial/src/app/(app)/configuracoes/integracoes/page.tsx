import { exigirPermissao } from '@/lib/auth/sessao'
import { Alerta, Card, Campo, Entrada, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { competenciaLonga, dataHora, numero } from '@/lib/format'
import { competenciaAtual, somarMeses } from '@/lib/competencia'
import { lerConfiguracoes } from '@/lib/cadastros/configuracao'
import { CHAVE_STATUS_ATIVOS, integracaoConfigurada, STATUS_ATIVOS_PADRAO } from '@/lib/integracoes/base-instalada'
import { ultimasFotografiasIntegracao } from '@/lib/integracoes/fotografia'
import { FormAcao } from '../../cadastros/_ui/FormAcao'
import { CabecalhoConfig, SeloHomologacao } from '../_abas'
import { registrarFotografiaAcao } from '../acoes'

export const metadata = { title: 'Integrações' }

const SIGNIFICADO_STATUS: [string, string][] = [['01', 'Ativo'], ['02', 'Em uso'], ['03', 'Manutenção'], ['X1', 'Pendente']]

export default async function PaginaIntegracoes() {
  const u = await exigirPermissao('configuracao.editar')
  const configurada = integracaoConfigurada()
  const [cfg, fotos] = await Promise.all([lerConfiguracoes([CHAVE_STATUS_ATIVOS]), ultimasFotografiasIntegracao()])
  const st = cfg.get(CHAVE_STATUS_ATIVOS)
  const statusAtivos = Array.isArray(st?.valor) ? (st!.valor as string[]) : STATUS_ATIVOS_PADRAO
  const sugestao = somarMeses(competenciaAtual(), -1).slice(0, 7)

  return (
    <div>
      <CabecalhoConfig u={u} ativo="integracoes" subtitulo="Integrações somente leitura com sistemas externos." />
      <Card titulo="Base instalada (Protheus/AA3 via Supabase bd_cl_inv)"
        acoes={configurada ? <Etiqueta tom="ok">● Configurada</Etiqueta> : <Etiqueta tom="atencao">○ Não configurada</Etiqueta>}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3 text-sm">
            <p>Leitura <strong>somente leitura</strong> (HTTP GET) da tabela <code>bd_cl_inv</code>. O sistema nunca grava no Supabase.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-neutro">URL (BASE_INSTALADA_SUPABASE_URL)</dt><dd>{process.env.BASE_INSTALADA_SUPABASE_URL ? 'Definida' : 'Não definida'}</dd>
              <dt className="text-neutro">Chave (BASE_INSTALADA_SUPABASE_KEY)</dt><dd>{process.env.BASE_INSTALADA_SUPABASE_KEY ? 'Definida (valor nunca exibido)' : 'Não definida'}</dd>
              <dt className="text-neutro">Status AA3 considerados ativos</dt>
              <dd className="flex flex-wrap items-center gap-2">{statusAtivos.join(', ')} <SeloHomologacao homologado={!!st?.homologado} /></dd>
            </dl>
            <p className="text-xs text-neutro">
              Regra: equipamentos ativos = soma de QTD das linhas com AA3_STATUS na lista acima; clientes = códigos distintos; lojas = pares código+loja distintos.
              Significado dos status conforme o painel legado ({SIGNIFICADO_STATUS.map(([c, s]) => `${c} = ${s}`).join('; ')}) — pendente de homologação.
              Ajuste a lista em Configurações › Parâmetros.
            </p>
          </div>
          <div>
            {configurada ? (
              <FormAcao acao={registrarFotografiaAcao} rotuloBotao="Registrar fotografia do mês"
                confirmar="Ler a base instalada agora e registrar a fotografia da base ativa de comodato para a competência escolhida?">
                <Campo rotulo="Competência" nome="competencia" obrigatorio ajuda="A leitura reflete a base no momento do registro. Períodos de Comodato aprovados ou fechados não aceitam nova fotografia.">
                  <Entrada id="competencia" name="competencia" type="month" defaultValue={sugestao} required />
                </Campo>
              </FormAcao>
            ) : (
              <Alerta tom="info" titulo="Como configurar">
                <ol className="mt-1 list-decimal pl-5">
                  <li>No servidor, defina a variável <code>BASE_INSTALADA_SUPABASE_URL</code> (ex.: https://&lt;projeto&gt;.supabase.co).</li>
                  <li>Defina <code>BASE_INSTALADA_SUPABASE_KEY</code> com uma chave de <strong>somente leitura</strong> (anon com RLS de leitura).</li>
                  <li>Reinicie a aplicação e volte a esta página para registrar a fotografia mensal.</li>
                </ol>
              </Alerta>
            )}
          </div>
        </div>
      </Card>
      <Card titulo="Últimas fotografias registradas pela integração" className="mt-5">
        {fotos.length === 0 ? <Vazio>Nenhuma fotografia de base ativa com origem INTEGRACAO.</Vazio> : (
          <Tabela legenda="Fotografias da base ativa de comodato registradas pela integração">
            <thead><tr><Th>Competência</Th><Th alinhar="direita">Equipamentos ativos</Th><Th alinhar="direita">Clientes ativos</Th><Th>Evidência</Th><Th>Registrado por</Th><Th>Situação</Th></tr></thead>
            <tbody>
              {fotos.map((f) => (
                <tr key={f.id}>
                  <Td>{competenciaLonga(f.competencia)}</Td>
                  <Td alinhar="direita">{numero(f.equipamentos_ativos)}</Td>
                  <Td alinhar="direita">{numero(f.clientes_ativos)}</Td>
                  <Td>{f.evidencia ?? '—'}</Td>
                  <Td>{f.criado_por_nome ?? 'Sistema'} · {dataHora(f.criado_em)}</Td>
                  <Td>{f.excluido_em ? <Etiqueta>○ Substituída</Etiqueta> : <Etiqueta tom="ok">● Vigente</Etiqueta>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>
    </div>
  )
}
