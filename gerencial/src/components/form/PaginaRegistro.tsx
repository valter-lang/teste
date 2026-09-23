import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { competenciaSelecionada, type SearchParams } from '@/lib/filtros'
import { competenciaLonga, dataHora } from '@/lib/format'
import { AbasArea } from '@/components/AbasArea'
import { Alerta, BotaoLink, Cabecalho, Card } from '@/components/ui'
import { camposEditaveis, urlLista, urlRegistro, type EntidadeDef } from '@/lib/operacao/entidades'
import { obterRegistro, registroParaEntrada, type Registro } from '@/lib/operacao/crud'
import { camposComOpcoes, nomesUsuarios, opcoesPecas } from '@/lib/operacao/formulario'
import { periodoBloqueado, ROTULO_STATUS_PERIODO, statusPeriodo } from '@/lib/operacao/periodo'
import { acaoExcluir, acaoSalvar } from '@/lib/operacao/acoes'
import { ROTULOS_ORIGEM } from '@/lib/validacao/comodato'
import type { Entrada } from '@/lib/operacao/tipos'
import { FormularioRegistro } from './FormularioRegistro'
import { ExcluirRegistro } from './ExcluirRegistro'
import { Anexos } from './Anexos'
import { StatusPeriodo } from './StatusPeriodo'

/**
 * Página de inclusão (id = 'novo') ou detalhe/edição de um registro. `extras` recebe o
 * registro carregado para seções específicas (tentativas, horas úteis, trocas vinculadas…).
 */
export async function PaginaRegistro({ def, id, searchParams, prefill, extras }: {
  def: EntidadeDef
  id: string
  searchParams: SearchParams
  prefill?: Entrada
  extras?: (reg: Registro, ctx: { podeEditar: boolean; bloqueado: boolean }) => ReactNode | Promise<ReactNode>
}) {
  const u = await exigirLogin()
  const sp = await searchParams
  const podeLer = pode(u, 'dados.ler', def.area)
  const podeEditar = pode(u, 'dados.editar', def.area)
  const podeRestritos = pode(u, 'dados.restritos.ler', def.area)
  const novo = id === 'novo'
  const voltar = <BotaoLink href={urlLista(def)}>Voltar à lista</BotaoLink>

  if (!podeLer || (novo && !podeEditar)) {
    return (
      <>
        <Cabecalho titulo={def.titulo} acoes={voltar} />
        <Alerta tom="critico">Acesso negado para o seu perfil.</Alerta>
      </>
    )
  }

  if (novo) {
    const comp = await competenciaSelecionada(sp.competencia)
    const status = def.semCompetencia ? null : await statusPeriodo(def.area, comp)
    const valores: Entrada = { ...def.padroes, ...(def.semCompetencia ? {} : { competencia: comp.slice(0, 7) }), ...prefill }
    const campos = await camposComOpcoes(camposEditaveis(def, podeRestritos))
    return (
      <div className="flex flex-col gap-5">
        <Cabecalho titulo={`Incluir ${def.singular}`} subtitulo={def.titulo} acoes={voltar} />
        <AbasArea area={def.area} ativo={def.secao} />
        {status && periodoBloqueado(status) && (
          <Alerta tom="atencao" titulo={`Período ${competenciaLonga(comp)} ${ROTULO_STATUS_PERIODO[status].toLowerCase()}`}>
            Lançamentos nesta competência serão recusados. Escolha outra competência ou solicite a reabertura do período.
          </Alerta>
        )}
        <Card>
          <FormularioRegistro campos={campos} valores={valores} acao={acaoSalvar.bind(null, def.chave, null)}
            pecas={def.pecas ? await opcoesPecas() : null} regrasUi={def.regrasUi} rotuloEnviar={`Incluir ${def.singular}`} />
        </Card>
      </div>
    )
  }

  const reg = await obterRegistro(def, Number(id), { podeRestritos })
  if (!reg) notFound()
  const comp = (reg.competencia as string | undefined) ?? null
  const status = comp ? await statusPeriodo(def.area, comp) : null
  const motivoRO = def.somenteLeitura?.(reg) ?? null
  const bloqueio = !podeEditar ? 'Seu perfil permite apenas consulta.'
    : reg.excluido_em ? 'Registro excluído: somente consulta.'
      : status && periodoBloqueado(status) ? `O período ${competenciaLonga(comp!)} está ${ROTULO_STATUS_PERIODO[status].toLowerCase()}; reabra o período para alterar.`
        : motivoRO
  const campos = await camposComOpcoes(camposEditaveis(def, podeRestritos), [reg])
  const nomes = await nomesUsuarios([reg.criado_por as string, reg.atualizado_por as string, reg.excluido_por as string])
  const nome = (k: string) => nomes.get(reg[k] as string) ?? 'Não informado'

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo={def.rotuloRegistro(reg)} subtitulo={def.titulo} acoes={<>
        {voltar}
        {podeEditar && <BotaoLink href={`${urlRegistro(def)}/novo${comp ? `?competencia=${comp}` : ''}`}>Incluir outro</BotaoLink>}
      </>} />
      <AbasArea area={def.area} ativo={def.secao} query={comp ? `competencia=${comp}` : undefined} />
      {comp && status && <StatusPeriodo competencia={comp} status={status} />}
      {reg.excluido_em && (
        <Alerta tom="critico" titulo="Registro excluído">
          Excluído em {dataHora(reg.excluido_em)}{reg.excluido_por ? ` por ${nome('excluido_por')}` : ''}
          {reg.motivo_exclusao ? ` — motivo: ${reg.motivo_exclusao}` : ''}.
        </Alerta>
      )}
      <Card>
        <FormularioRegistro campos={campos} valores={registroParaEntrada(def, reg)} versao={(reg.versao as number) ?? null}
          acao={acaoSalvar.bind(null, def.chave, reg.id)} bloqueio={bloqueio}
          pecas={def.pecas ? await opcoesPecas(reg.__pecas) : null} regrasUi={def.regrasUi}
          rotuloEnviar="Salvar alterações" mensagemInicial={sp.salvo === '1' ? 'Registro incluído.' : undefined} />
      </Card>
      {extras && (await extras(reg, { podeEditar, bloqueado: !!bloqueio }))}
      {def.anexos && <Anexos chave={def.chave} entidade={def.tabela} id={reg.id} podeEditar={podeEditar && !bloqueio} />}
      <Card titulo="Rastreabilidade">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-neutro">Incluído</dt><dd>{dataHora(reg.criado_em as Date)} · {nome('criado_por')}</dd></div>
          {'atualizado_em' in reg && <div><dt className="text-xs text-neutro">Última alteração</dt><dd>{dataHora(reg.atualizado_em as Date)} · {nome('atualizado_por')}</dd></div>}
          {'origem' in reg && <div><dt className="text-xs text-neutro">Origem</dt><dd>{ROTULOS_ORIGEM[reg.origem as 'MANUAL'] ?? String(reg.origem)}</dd></div>}
          {reg.versao != null && <div><dt className="text-xs text-neutro">Versão</dt><dd>{String(reg.versao)}</dd></div>}
        </dl>
      </Card>
      {podeEditar && !bloqueio && (
        <ExcluirRegistro acao={acaoExcluir.bind(null, def.chave, reg.id)} versao={(reg.versao as number) ?? null} fisica={def.controle.exclusao === 'fisica'} />
      )}
    </div>
  )
}
