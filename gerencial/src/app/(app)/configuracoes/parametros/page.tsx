import { exigirPermissao } from '@/lib/auth/sessao'
import { Alerta, Card, Entrada, Selecao } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { lerConfiguracoes } from '@/lib/cadastros/configuracao'
import { exibirParametro, PARAMETROS, type ParametroDef } from '@/lib/cadastros/parametros'
import { FormAcao } from '../../cadastros/_ui/FormAcao'
import { CabecalhoConfig, SeloHomologacao } from '../_abas'
import { salvarParametroAcao } from '../acoes'

export const metadata = { title: 'Parâmetros' }

export default async function PaginaParametros() {
  const u = await exigirPermissao('configuracao.editar')
  const cfg = await lerConfiguracoes(PARAMETROS.map((p) => p.chave))
  const pendentes = PARAMETROS.filter((p) => !cfg.get(p.chave)?.homologado).length
  return (
    <div>
      <CabecalhoConfig u={u} ativo="parametros" subtitulo="Parâmetros das regras de cálculo. Toda alteração fica na trilha de auditoria." />
      {pendentes > 0 && (
        <div className="mb-4"><Alerta tom="atencao" titulo={`${pendentes} parâmetro(s) pendente(s) de homologação`}>Os valores atuais são usados nos cálculos, mas os resultados dependentes são sinalizados como provisórios.</Alerta></div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PARAMETROS.map((p) => {
          const linha = cfg.get(p.chave)
          const valor = linha ? linha.valor : p.padrao
          return (
            <Card key={p.chave} titulo={p.rotulo} acoes={<SeloHomologacao homologado={!!linha?.homologado} />}>
              <p className="mb-1 text-sm text-neutro">{p.ajuda}</p>
              <p className="mb-3 text-xs text-neutro">
                Chave <code>{p.chave}</code> · valor atual: <strong className="text-tinta">{exibirParametro(p, valor)}</strong>
                {!linha && ' (padrão; ainda não gravado)'}
                {linha && ` · alterado em ${dataHora(linha.atualizado_em)}${linha.atualizado_por_nome ? ` por ${linha.atualizado_por_nome}` : ''}`}
              </p>
              <FormAcao acao={salvarParametroAcao} rotuloBotao="Salvar" className="flex flex-col gap-3">
                <input type="hidden" name="chave" value={p.chave} />
                <EntradaParametro def={p} valor={valor} />
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="homologado" defaultChecked={!!linha?.homologado} className="h-4 w-4 accent-vinho" />
                  Valor homologado pela gestão
                </label>
              </FormAcao>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EntradaParametro({ def: p, valor }: { def: ParametroDef; valor: unknown }) {
  const id = `v-${p.chave.replace(/\W/g, '-')}`
  const rot = <label htmlFor={id} className="text-sm font-semibold">Novo valor</label>
  switch (p.tipo) {
    case 'data':
      return <div className="flex flex-col gap-1">{rot}<Entrada id={id} name="valor" type="date" defaultValue={String(valor ?? '')} required /></div>
    case 'inteiro':
      return <div className="flex flex-col gap-1">{rot}<Entrada id={id} name="valor" type="number" step={1} defaultValue={String(valor ?? '')} required /></div>
    case 'inteiro_opcional':
      return <div className="flex flex-col gap-1">{rot}<Entrada id={id} name="valor" type="number" step={1} min={1} defaultValue={valor === null || valor === undefined ? '' : String(valor)} placeholder="Em branco = não definido" /></div>
    case 'decimal':
      return <div className="flex flex-col gap-1">{rot}<Entrada id={id} name="valor" type="text" inputMode="decimal" defaultValue={String(valor ?? '').replace('.', ',')} required /></div>
    case 'booleano':
      return (
        <div className="flex flex-col gap-1">{rot}
          <Selecao id={id} name="valor" defaultValue={valor ? 'true' : 'false'}>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Selecao>
        </div>
      )
    case 'opcao':
      return (
        <div className="flex flex-col gap-1">{rot}
          <Selecao id={id} name="valor" defaultValue={String(valor ?? '')}>
            {p.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </Selecao>
        </div>
      )
    case 'areas': {
      const sel = Array.isArray(valor) ? (valor as string[]) : []
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Áreas</legend>
          {p.opcoes?.map((o) => (
            <label key={o.valor} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="valores" value={o.valor} defaultChecked={sel.includes(o.valor)} className="h-4 w-4 accent-vinho" /> {o.rotulo}
            </label>
          ))}
        </fieldset>
      )
    }
    case 'lista_texto':
      return <div className="flex flex-col gap-1">{rot}<Entrada id={id} name="valor" type="text" defaultValue={Array.isArray(valor) ? valor.join(', ') : ''} required /></div>
  }
}
