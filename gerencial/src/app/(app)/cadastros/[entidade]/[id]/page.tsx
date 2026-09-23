import { notFound } from 'next/navigation'
import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { Alerta, BotaoLink, Cabecalho, Card, Campo, Entrada, Tabela, Td, Th, Vazio } from '@/components/ui'
import { entidadePorSlug } from '@/lib/cadastros/definicoes'
import { listarAliases, listarCadastro, obterCadastro } from '@/lib/cadastros/servico'
import { paramTexto, type SearchParams } from '@/lib/filtros'
import { FormCadastro } from '../../_ui/FormCadastro'
import { FormAcao } from '../../_ui/FormAcao'
import { AcaoRapida } from '../../_ui/AcaoRapida'
import { Celula, EtiquetaAtivo } from '../../_ui/celula'
import { carregarOpcoes } from '../../_ui/opcoes'
import { adicionarAliasAcao, alternarAtivoAcao, removerAliasAcao, salvarCadastroAcao } from '../../acoes'

export default async function EditarCadastro({ params, searchParams }: { params: Promise<{ entidade: string; id: string }>; searchParams: SearchParams }) {
  const u = await exigirPermissao('dados.ler')
  const { entidade, id: idTexto } = await params
  const def = entidadePorSlug(entidade)
  const id = Number(idTexto)
  if (!def || !Number.isInteger(id) || id <= 0) notFound()
  const registro = await obterCadastro(def, id)
  if (!registro) notFound()
  const editar = pode(u, 'cadastros.editar')
  const opcoes = await carregarOpcoes(def, registro)
  const sp = await searchParams
  const ok = paramTexto(sp.ok)

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <p className="text-sm">
        {def.slug === 'contratos'
          ? <Link href={`/cadastros/clientes/${registro.cliente_id}`} className="font-semibold text-vinho hover:underline">← Cliente</Link>
          : <Link href={`/cadastros/${def.slug}`} className="font-semibold text-vinho hover:underline">← {def.titulo}</Link>}
      </p>
      <Cabecalho
        titulo={registro._rotulo}
        subtitulo={<span className="inline-flex items-center gap-2">{def.singular[0].toUpperCase() + def.singular.slice(1)} nº {registro.id} <EtiquetaAtivo ativo={registro.ativo} validoAte={registro.valido_ate} /></span>}
        acoes={
          <>
            {pode(u, 'auditoria.ler') && <BotaoLink href={`/auditoria?tabela=${def.tabela}&registro_id=${registro.id}`}>Histórico de alterações</BotaoLink>}
            {editar && (
              <AcaoRapida acao={alternarAtivoAcao} campos={{ entidade: def.slug, id: String(registro.id), ativo: String(!registro.ativo) }}
                rotulo={registro.ativo ? 'Desativar' : 'Reativar'} variante={registro.ativo ? 'perigo' : 'secundario'}
                confirmar={registro.ativo ? 'Desativar este cadastro? O histórico é preservado e ele deixa de aparecer para novos lançamentos.' : undefined} />
            )}
          </>
        }
      />
      {ok === 'contrato' && <Alerta tom="ok">✓ Contrato salvo.</Alerta>}
      {!registro.ativo && <Alerta tom="atencao" titulo="Cadastro desativado">Continua disponível no histórico e nos relatórios já gerados, mas não pode ser usado em novos lançamentos. Reative-o se necessário.</Alerta>}
      <Card titulo="Dados">
        <FormCadastro
          campos={def.campos}
          valores={Object.fromEntries(def.campos.map((c) => [c.nome, registro[c.nome] ?? null]))}
          opcoes={opcoes}
          acao={salvarCadastroAcao.bind(null, def.slug, registro.id)}
          rotuloBotao="Salvar alterações"
          cancelarHref={`/cadastros/${def.slug}`}
          somenteLeitura={!editar}
          voltar={def.slug === 'contratos' ? `/cadastros/clientes/${registro.cliente_id}?ok=contrato` : undefined}
        />
      </Card>
      {def.slug === 'familias-equipamento' && <SecaoAliases familiaId={registro.id} editar={editar} />}
      {def.slug === 'clientes' && <SecaoContratos clienteId={registro.id} editar={editar && registro.ativo} />}
    </div>
  )
}

async function SecaoAliases({ familiaId, editar }: { familiaId: number; editar: boolean }) {
  const aliases = await listarAliases(familiaId)
  return (
    <Card titulo="Sinônimos usados na importação">
      <p className="mb-3 text-sm text-neutro">Grafias da planilha que o importador reconhece como esta família (comparação em maiúsculas, espaços internos preservados).</p>
      {aliases.length === 0 ? <Vazio>Nenhum sinônimo cadastrado.</Vazio> : (
        <ul className="mb-4 flex flex-col gap-2">
          {aliases.map((a) => (
            <li key={a.alias} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-pedra/60 px-3 py-2">
              <code className="text-sm whitespace-pre">{a.alias}</code>
              {editar && (
                <AcaoRapida acao={removerAliasAcao} campos={{ familia_id: String(familiaId), alias: a.alias }} rotulo="Remover"
                  variante="perigo" rotuloAcessivel={`Remover sinônimo ${a.alias}`}
                  confirmar={`Remover o sinônimo “${a.alias}”? Importações futuras deixarão de reconhecê-lo.`} />
              )}
            </li>
          ))}
        </ul>
      )}
      {editar && (
        <FormAcao acao={adicionarAliasAcao} rotuloBotao="Adicionar sinônimo" className="flex flex-col gap-3 md:max-w-md">
          <input type="hidden" name="familia_id" value={familiaId} />
          <Campo rotulo="Novo sinônimo" nome="alias" obrigatorio ajuda="Ex.: CLIMATICA para CLIMATIZADORA.">
            <Entrada id="alias" name="alias" required maxLength={120} autoComplete="off" />
          </Campo>
        </FormAcao>
      )}
    </Card>
  )
}

async function SecaoContratos({ clienteId, editar }: { clienteId: number; editar: boolean }) {
  const def = entidadePorSlug('contratos')!
  const { linhas } = await listarCadastro(def, { status: 'todos', igual: { cliente_id: clienteId }, porPagina: 50 })
  const colunas = ['numero', 'inicio', 'fim', 'consumo_minimo_kg_mes'].map((n) => def.campos.find((c) => c.nome === n)!)
  return (
    <Card titulo="Contratos de comodato" acoes={editar && <BotaoLink variante="primario" href={`/cadastros/contratos/novo?cliente_id=${clienteId}`}>+ Novo contrato</BotaoLink>}>
      {linhas.length === 0 ? <Vazio>Nenhum contrato de comodato cadastrado para este cliente. Consumo mínimo: Não informado.</Vazio> : (
        <Tabela legenda="Contratos de comodato do cliente">
          <thead><tr>{colunas.map((c) => <Th key={c.nome}>{c.rotulo}</Th>)}<Th>Situação</Th><Th alinhar="direita">Ações</Th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                {colunas.map((c) => <Td key={c.nome}><Celula campo={c} linha={l} /></Td>)}
                <Td><EtiquetaAtivo ativo={l.ativo} /></Td>
                <Td alinhar="direita"><BotaoLink href={`/cadastros/contratos/${l.id}`} className="px-2.5 py-1 text-xs">{editar ? 'Editar' : 'Ver'}</BotaoLink></Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Card>
  )
}
