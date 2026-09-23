import Link from 'next/link'
import { exigirPermissao } from '@/lib/auth/sessao'
import { Alerta, Card, Campo, Entrada, Selecao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { q } from '@/lib/db'
import { data, dataHora } from '@/lib/format'
import { paramInteiro, type SearchParams } from '@/lib/filtros'
import { ABRANGENCIAS, lerConfiguracoes, listarFeriados } from '@/lib/cadastros/configuracao'
import { DIAS_SEMANA, type Expediente } from '@/lib/cadastros/parametros'
import { FormAcao } from '../../cadastros/_ui/FormAcao'
import { AcaoRapida } from '../../cadastros/_ui/AcaoRapida'
import { CabecalhoConfig, SeloHomologacao } from '../_abas'
import { excluirFeriadoAcao, homologarConfiguracaoAcao, salvarExpedienteAcao, salvarFeriadoAcao } from '../acoes'

export const metadata = { title: 'Calendário oficial' }

const FUSOS = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Recife', 'America/Belem', 'America/Fortaleza', 'America/Rio_Branco', 'America/Noronha']

export default async function PaginaCalendario({ searchParams }: { searchParams: SearchParams }) {
  const u = await exigirPermissao('configuracao.editar')
  const sp = await searchParams
  const anoAtual = new Date().getFullYear()
  const ano = Math.min(2100, Math.max(2000, paramInteiro(sp.ano, anoAtual)))
  const editarId = paramInteiro(sp.editar, 0)
  const [feriados, cfg, unidades] = await Promise.all([
    listarFeriados(ano),
    lerConfiguracoes(['calendario.expediente']),
    q<{ id: number; nome: string }>('select id, nome from unidade where ativo order by nome'),
  ])
  const exp = cfg.get('calendario.expediente')
  const valor = (exp?.valor ?? { fuso: 'America/Sao_Paulo', dias_uteis: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' }) as Expediente
  const emEdicao = feriados.find((f) => f.id === editarId)

  return (
    <div>
      <CabecalhoConfig u={u} ativo="calendario" subtitulo="Calendário oficial usado no cálculo de horas e dias úteis (SLA, backlog, MTTR)." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_24rem]">
        <Card titulo={`Feriados de ${ano}`} acoes={
          <nav aria-label="Ano" className="flex gap-2 text-sm">
            <Link className="font-semibold text-vinho hover:underline" href={`?ano=${ano - 1}`}>← {ano - 1}</Link>
            <Link className="font-semibold text-vinho hover:underline" href={`?ano=${ano + 1}`}>{ano + 1} →</Link>
          </nav>
        }>
          {feriados.length === 0 ? <Vazio>Nenhum feriado cadastrado para {ano}.</Vazio> : (
            <Tabela legenda={`Feriados de ${ano}`}>
              <thead><tr><Th>Data</Th><Th>Descrição</Th><Th>Abrangência</Th><Th>Unidade</Th><Th>Período</Th><Th alinhar="direita">Ações</Th></tr></thead>
              <tbody>
                {feriados.map((f) => (
                  <tr key={f.id} className={f.id === editarId ? 'bg-rosa-claro/40' : ''}>
                    <Td>{data(f.data)}</Td>
                    <Td>{f.descricao}</Td>
                    <Td>{ABRANGENCIAS.find((a) => a.valor === f.abrangencia)?.rotulo ?? f.abrangencia}</Td>
                    <Td>{f.unidade_nome ?? 'Todas'}</Td>
                    <Td>{f.meio_periodo ? 'Meio período' : 'Dia inteiro'}</Td>
                    <Td alinhar="direita">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={`?ano=${ano}&editar=${f.id}#form-feriado`} className="rounded-md px-2 py-1 text-xs font-semibold text-vinho hover:bg-creme" aria-label={`Editar ${f.descricao}`}>Editar</Link>
                        <AcaoRapida acao={excluirFeriadoAcao} campos={{ id: String(f.id) }} rotulo="Excluir" variante="perigo"
                          rotuloAcessivel={`Excluir ${f.descricao}`} confirmar={`Excluir o feriado “${f.descricao}” (${data(f.data)})? A exclusão fica registrada na auditoria.`} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card titulo={emEdicao ? 'Editar feriado' : 'Incluir feriado'} id="form-feriado">
            <FormAcao acao={salvarFeriadoAcao} rotuloBotao={emEdicao ? 'Salvar feriado' : 'Incluir feriado'} key={emEdicao?.id ?? 'novo'}>
              {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
              <Campo rotulo="Data" nome="data" obrigatorio><Entrada id="data" name="data" type="date" required defaultValue={emEdicao?.data} /></Campo>
              <Campo rotulo="Descrição" nome="descricao" obrigatorio><Entrada id="descricao" name="descricao" required maxLength={120} defaultValue={emEdicao?.descricao} /></Campo>
              <Campo rotulo="Abrangência" nome="abrangencia" obrigatorio>
                <Selecao id="abrangencia" name="abrangencia" defaultValue={emEdicao?.abrangencia ?? 'NACIONAL'}>
                  {ABRANGENCIAS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Unidade" nome="unidade" ajuda="Obrigatória para feriado municipal.">
                <Selecao id="unidade" name="unidade" defaultValue={emEdicao?.unidade_id ?? ''}>
                  <option value="">Todas as unidades</option>
                  {unidades.map((un) => <option key={un.id} value={un.id}>{un.nome}</option>)}
                </Selecao>
              </Campo>
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="meio_periodo" defaultChecked={emEdicao?.meio_periodo} className="h-4 w-4 accent-vinho" /> Meio período
              </label>
            </FormAcao>
            {emEdicao && <p className="mt-2 text-sm"><Link href={`?ano=${ano}`} className="font-semibold text-vinho hover:underline">Cancelar edição</Link></p>}
          </Card>
          <Card titulo="Expediente oficial" acoes={<SeloHomologacao homologado={!!exp?.homologado} />}>
            {!exp?.homologado && (
              <div className="mb-3">
                <Alerta tom="atencao" titulo="Pendente de homologação">Horas úteis calculadas com este expediente são provisórias até a homologação.</Alerta>
              </div>
            )}
            <FormAcao acao={salvarExpedienteAcao} rotuloBotao="Salvar expediente">
              <Campo rotulo="Fuso horário" nome="fuso" obrigatorio>
                <Selecao id="fuso" name="fuso" defaultValue={valor.fuso}>
                  {[...new Set([valor.fuso, ...FUSOS])].map((f) => <option key={f} value={f}>{f}</option>)}
                </Selecao>
              </Campo>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-semibold">Dias úteis</legend>
                <div className="flex flex-wrap gap-3">
                  {DIAS_SEMANA.map((d, i) => (
                    <label key={d} className="inline-flex items-center gap-1 text-sm">
                      <input type="checkbox" name="dias" value={i} defaultChecked={valor.dias_uteis.includes(i)} className="h-4 w-4 accent-vinho" /> {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Início" nome="inicio" obrigatorio><Entrada id="inicio" name="inicio" type="time" defaultValue={valor.inicio} required /></Campo>
                <Campo rotulo="Fim" nome="fim" obrigatorio><Entrada id="fim" name="fim" type="time" defaultValue={valor.fim} required /></Campo>
              </div>
              <p className="text-xs text-neutro">Alterar o expediente ou os feriados retira a homologação.</p>
            </FormAcao>
            {exp && (
              <p className="mt-3 text-xs text-neutro">Última alteração: {dataHora(exp.atualizado_em)}{exp.atualizado_por_nome ? ` por ${exp.atualizado_por_nome}` : ''}.</p>
            )}
            {exp && !exp.homologado && (
              <div className="mt-3 border-t border-pedra/60 pt-3">
                <AcaoRapida acao={homologarConfiguracaoAcao} campos={{ chave: 'calendario.expediente' }} rotulo="Marcar como homologado" variante="primario"
                  confirmar="Confirmar que o expediente e o calendário de feriados foram homologados pela gestão?" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
