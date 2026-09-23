'use client'
import { useActionState, useState } from 'react'
import { proporMeta, decidirMeta } from './acoes'
import { Alerta, Botao, Campo, Entrada, Selecao } from '@/components/ui'

export function FormMeta({ indicadores, inicial }: { indicadores: { codigo: string; nome: string }[]; inicial?: string }) {
  const [estado, acao, pendente] = useActionState(proporMeta, undefined)
  const [excecao, setExcecao] = useState(false)
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-3">
      {estado?.erro && <div className="md:col-span-3"><Alerta tom="critico">{estado.erro}</Alerta></div>}
      {estado?.ok && <div className="md:col-span-3"><Alerta tom="ok">✓ {estado.ok}</Alerta></div>}
      <Campo rotulo="Indicador" nome="indicador_codigo" obrigatorio className="md:col-span-3">
        <Selecao id="indicador_codigo" name="indicador_codigo" defaultValue={inicial}>{indicadores.map((i) => <option key={i.codigo} value={i.codigo}>{i.nome} ({i.codigo})</option>)}</Selecao>
      </Campo>
      <Campo rotulo="Ciclo" nome="ciclo" obrigatorio><Selecao id="ciclo" name="ciclo"><option value="MENSAL">Mensal</option><option value="TRIMESTRAL">Trimestral</option><option value="SEMESTRAL">Semestral</option><option value="ANUAL">Anual</option></Selecao></Campo>
      <Campo rotulo="Tipo" nome="tipo" obrigatorio><Selecao id="tipo" name="tipo">
        <option value="ABSOLUTA">Valor absoluto</option><option value="LINHA_BASE_MAIS">Linha de base + incremento</option><option value="PERCENTUAL_SOBRE_LINHA_BASE">% sobre linha de base</option>
        <option value="VARIACAO_PERIODO_ANTERIOR">Variação % sobre período anterior</option><option value="TENDENCIA_QUEDA">Tendência de queda</option><option value="CONTAGEM_MINIMA">Contagem mínima</option></Selecao></Campo>
      <Campo rotulo="Operador" nome="operador" obrigatorio><Selecao id="operador" name="operador"><option value=">=">≥ (maior é melhor)</option><option value="<=">≤ (menor é melhor)</option><option value="ENTRE">Entre (faixa)</option><option value="=">=</option></Selecao></Campo>
      <Campo rotulo="Valor" nome="valor" ajuda="Vazio = pendente de homologação"><Entrada id="valor" name="valor" inputMode="decimal" /></Campo>
      <Campo rotulo="Valor máximo (faixa)" nome="valor_max"><Entrada id="valor_max" name="valor_max" inputMode="decimal" /></Campo>
      <Campo rotulo="Tolerância do amarelo (%)" nome="tolerancia_pct"><Entrada id="tolerancia_pct" name="tolerancia_pct" defaultValue="5" inputMode="decimal" /></Campo>
      <Campo rotulo="Linha de base" nome="linha_base"><Entrada id="linha_base" name="linha_base" inputMode="decimal" /></Campo>
      <Campo rotulo="Competência da linha de base" nome="linha_base_competencia"><Entrada id="linha_base_competencia" name="linha_base_competencia" type="month" /></Campo>
      <Campo rotulo="Início da vigência" nome="vigencia_inicio" obrigatorio ajuda="Metas trimestrais/semestrais só na virada do ciclo."><Entrada id="vigencia_inicio" name="vigencia_inicio" type="month" required /></Campo>
      <Campo rotulo="Documento de origem" nome="fonte_documento" obrigatorio className="md:col-span-3"><Entrada id="fonte_documento" name="fonte_documento" required /></Campo>
      <Campo rotulo="Motivo da alteração" nome="motivo" obrigatorio className="md:col-span-3"><Entrada id="motivo" name="motivo" required /></Campo>
      <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" name="excecao_ciclo" checked={excecao} onChange={(e) => setExcecao(e.target.checked)} /> Exceção à regra de virada do ciclo</label>
      {excecao && <Campo rotulo="Justificativa da exceção" nome="justificativa_excecao" obrigatorio className="md:col-span-3"><Entrada id="justificativa_excecao" name="justificativa_excecao" /></Campo>}
      {!excecao && <input type="hidden" name="justificativa_excecao" value="" />}
      <div className="md:col-span-3"><Botao type="submit" disabled={pendente}>Registrar proposta</Botao></div>
    </form>
  )
}

export function DecisaoMeta({ id }: { id: number }) {
  const [estado, acao, pendente] = useActionState(decidirMeta, undefined)
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Botao name="decisao" value="APROVAR" variante="primario" disabled={pendente} className="px-2 py-1 text-xs">Aprovar</Botao>
      <Botao name="decisao" value="REJEITAR" variante="perigo" disabled={pendente} className="px-2 py-1 text-xs">Rejeitar</Botao>
      {estado?.erro && <span className="text-xs text-critico">{estado.erro}</span>}
      {estado?.ok && <span className="text-xs text-ok">✓ {estado.ok}</span>}
    </form>
  )
}
