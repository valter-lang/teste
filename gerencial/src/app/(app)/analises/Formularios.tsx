'use client'
import { useActionState, useState } from 'react'
import { salvarAnalise, comentar } from './acoes'
import { Alerta, AreaTexto, Botao, Campo, Entrada, Selecao } from '@/components/ui'

export const TIPOS: Record<string, string> = {
  DESTAQUE: 'Destaque positivo', ATENCAO: 'Ponto de atenção', RISCO: 'Risco', DEPENDENCIA: 'Dependência de outra área',
  EXPLICACAO_DESVIO: 'Explicação de desvio', DECISAO_SOLICITADA: 'Decisão solicitada à Diretoria',
}

export function FormAnalise({ competencia, area, indicadores, areas }: { competencia: string; area: string; indicadores: { codigo: string; nome: string }[]; areas: { codigo: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(salvarAnalise, undefined)
  const [tipo, setTipo] = useState('DESTAQUE')
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="competencia" value={competencia} /><input type="hidden" name="area_codigo" value={area} />
      {estado?.erro && <div className="md:col-span-2"><Alerta tom="critico">{estado.erro}</Alerta></div>}
      {estado?.ok && <div className="md:col-span-2"><Alerta tom="ok">✓ {estado.ok}</Alerta></div>}
      <Campo rotulo="Tipo" nome={`tipo-${area}`} obrigatorio>
        <Selecao id={`tipo-${area}`} name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selecao>
      </Campo>
      <Campo rotulo="Indicador" nome={`ind-${area}`} ajuda={tipo === 'EXPLICACAO_DESVIO' ? 'Obrigatório.' : undefined}>
        <Selecao id={`ind-${area}`} name="indicador_codigo" defaultValue=""><option value="">—</option>{indicadores.map((i) => <option key={i.codigo} value={i.codigo}>{i.nome}</option>)}</Selecao>
      </Campo>
      <Campo rotulo="Fato" nome={`fato-${area}`} obrigatorio className="md:col-span-2"><AreaTexto id={`fato-${area}`} name="fato" required /></Campo>
      <Campo rotulo="Número" nome={`num-${area}`} ajuda="Ex.: 131 recuperações; 7,8%" obrigatorio={tipo === 'DESTAQUE'}><Entrada id={`num-${area}`} name="numero" /></Campo>
      <Campo rotulo="Responsável" nome={`resp-${area}`} obrigatorio><Entrada id={`resp-${area}`} name="responsavel" required /></Campo>
      {tipo === 'ATENCAO' && <Campo rotulo="Ocorrência real (se não houver indicador)" nome={`oc-${area}`}><Entrada id={`oc-${area}`} name="ocorrencia" /></Campo>}
      {tipo === 'DEPENDENCIA' && (
        <Campo rotulo="Depende da área" nome={`dep-${area}`} obrigatorio>
          <Selecao id={`dep-${area}`} name="area_dependente" defaultValue="">{[{ codigo: '', nome: 'Selecione' }, ...areas.filter((a) => a.codigo !== area)].map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}</Selecao>
        </Campo>
      )}
      <div className="md:col-span-2"><Botao type="submit" disabled={pendente}>Adicionar</Botao></div>
    </form>
  )
}

export function FormComentario({ competencia, area }: { competencia: string; area?: string }) {
  const [estado, acao, pendente] = useActionState(comentar, undefined)
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="competencia" value={competencia} /><input type="hidden" name="area_codigo" value={area ?? ''} />
      {estado?.erro && <Alerta tom="critico">{estado.erro}</Alerta>}
      <label className="text-sm font-semibold" htmlFor={`com-${area}`}>Comentário da Diretoria</label>
      <AreaTexto id={`com-${area}`} name="texto" required />
      <Botao type="submit" variante="secundario" disabled={pendente}>Comentar</Botao>
    </form>
  )
}
