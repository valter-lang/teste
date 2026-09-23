import { Etiqueta } from '@/components/ui'
import { rotuloOpcao, type CampoDef } from '@/lib/cadastros/definicoes'
import { data, numero } from '@/lib/format'

/** Valor de um campo formatado para listagem (ausente: travessão, nunca zero). */
export function Celula({ campo: c, linha }: { campo: CampoDef; linha: Record<string, unknown> }) {
  const v = linha[c.nome]
  if (c.tipo === 'booleano') return v ? <Etiqueta tom="vinho">✓ Sim</Etiqueta> : <span className="text-neutro">Não</span>
  if (v === null || v === undefined || v === '') return <span className="text-neutro" aria-label="não informado">—</span>
  switch (c.tipo) {
    case 'referencia': return <>{String(linha[`${c.nome}__rotulo`] ?? v)}</>
    case 'selecao': return <>{rotuloOpcao(c, v)}</>
    case 'data': return <>{data(String(v))}</>
    case 'decimal': return <>{numero(Number(v), 3).replace(/,?0+$/, '')}</>
    case 'inteiro': return <>{numero(Number(v))}</>
    default: return <>{String(v)}</>
  }
}

export function EtiquetaAtivo({ ativo, validoAte }: { ativo: boolean; validoAte?: unknown }) {
  return ativo
    ? <Etiqueta tom="ok">● Ativo</Etiqueta>
    : <Etiqueta tom="neutro">○ Desativado{validoAte ? ` em ${data(String(validoAte))}` : ''}</Etiqueta>
}
