'use client'
import { useActionState } from 'react'
import { salvarPlano } from './acoes'
import { Alerta, AreaTexto, Botao, Campo, Entrada, Selecao } from '@/components/ui'

export interface ValoresPlano { [k: string]: string | number | null | undefined }

export function FormPlano({ v, areas, indicadores }: { v: ValoresPlano; areas: { codigo: string; nome: string }[]; indicadores: { codigo: string; nome: string; area: string }[] }) {
  const [estado, acao, pendente] = useActionState(salvarPlano, undefined)
  const e = estado?.campos ?? {}
  const s = (k: string) => (v[k] ?? '') as string
  return (
    <form action={acao} className="grid gap-4 md:grid-cols-2">
      {estado?.erro && <div className="md:col-span-2"><Alerta tom="critico">{estado.erro}</Alerta></div>}
      <input type="hidden" name="id" value={s('id')} /><input type="hidden" name="versao" value={s('versao')} />
      <Campo rotulo="Área" nome="area_codigo" obrigatorio>
        <Selecao id="area_codigo" name="area_codigo" defaultValue={s('area_codigo')} required disabled={!!v.id}>
          {areas.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
        </Selecao>
        {!!v.id && <input type="hidden" name="area_codigo" value={s('area_codigo')} />}
      </Campo>
      <Campo rotulo="Indicador de origem" nome="indicador_codigo" erro={e.indicador_codigo}>
        <Selecao id="indicador_codigo" name="indicador_codigo" defaultValue={s('indicador_codigo')}>
          <option value="">— Ocorrência (sem indicador) —</option>
          {indicadores.map((i) => <option key={i.codigo} value={i.codigo}>{i.nome}</option>)}
        </Selecao>
      </Campo>
      <Campo rotulo="Competência de origem" nome="competencia_origem" ajuda="Mês em que o desvio foi identificado.">
        <Entrada id="competencia_origem" name="competencia_mes" type="month" defaultValue={s('competencia_origem').slice(0, 7)} />
      </Campo>
      <Campo rotulo="Ocorrência de origem" nome="ocorrencia" erro={e.ocorrencia} ajuda="Obrigatória quando não há indicador vinculado.">
        <Entrada id="ocorrencia" name="ocorrencia" defaultValue={s('ocorrencia')} />
      </Campo>
      <Campo rotulo="Causa raiz" nome="causa_raiz" obrigatorio erro={e.causa_raiz} className="md:col-span-2">
        <AreaTexto id="causa_raiz" name="causa_raiz" defaultValue={s('causa_raiz')} required invalido={!!e.causa_raiz} />
      </Campo>
      <Campo rotulo="Ação objetiva" nome="acao" obrigatorio erro={e.acao} className="md:col-span-2" ajuda="O que será feito, por quem e como. Ações vagas como “acompanhar” não são aceitas sem entregável.">
        <AreaTexto id="acao" name="acao" defaultValue={s('acao')} required invalido={!!e.acao} />
      </Campo>
      <Campo rotulo="Entregável" nome="entregavel" obrigatorio erro={e.entregavel}><Entrada id="entregavel" name="entregavel" defaultValue={s('entregavel')} required /></Campo>
      <Campo rotulo="Responsável nominal" nome="responsavel_nome" obrigatorio erro={e.responsavel_nome}><Entrada id="responsavel_nome" name="responsavel_nome" defaultValue={s('responsavel_nome')} required /></Campo>
      <Campo rotulo="Início" nome="inicio" obrigatorio erro={e.inicio}><Entrada id="inicio" name="inicio" type="date" defaultValue={s('inicio')} required /></Campo>
      <Campo rotulo="Prazo" nome="prazo" obrigatorio erro={e.prazo}><Entrada id="prazo" name="prazo" type="date" defaultValue={s('prazo')} required /></Campo>
      <Campo rotulo="Criticidade" nome="criticidade" obrigatorio>
        <Selecao id="criticidade" name="criticidade" defaultValue={s('criticidade') || 'MEDIA'}><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option></Selecao>
      </Campo>
      <Campo rotulo="Resultado esperado" nome="resultado_esperado" obrigatorio erro={e.resultado_esperado}><Entrada id="resultado_esperado" name="resultado_esperado" defaultValue={s('resultado_esperado')} required /></Campo>
      <input type="hidden" name="cliente_id" value={s('cliente_id')} />
      <div className="md:col-span-2"><Botao type="submit" disabled={pendente}>{v.id ? 'Salvar alterações' : 'Criar plano de ação'}</Botao></div>
    </form>
  )
}
