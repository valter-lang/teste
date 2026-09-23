import { PaginaRegistro } from '@/components/form/PaginaRegistro'
import { Card, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { entidade } from '@/lib/operacao/entidades'
import type { Registro } from '@/lib/operacao/crud'
import { listarTentativas } from '@/lib/operacao/comodato'
import { acaoExcluirTentativa, acaoTentativa } from '@/lib/operacao/acoes'
import { data, dataHora } from '@/lib/format'
import { hojeLocal } from '@/lib/validacao/comum'
import type { SearchParams } from '@/lib/filtros'
import { ExcluirTentativa, FormTentativa } from './FormTentativa'

export const metadata = { title: 'Movimento de comodato' }

async function Tentativas({ reg, podeEditar, bloqueado }: { reg: Registro; podeEditar: boolean; bloqueado: boolean }) {
  const tentativas = await listarTentativas(reg.id)
  const aberto = !['CONCLUIDO', 'CANCELADO'].includes(String(reg.situacao))
  const editavel = podeEditar && !bloqueado
  return (
    <Card titulo="Tentativas de execução">
      {tentativas.length === 0 ? <Vazio>Nenhuma tentativa registrada.</Vazio> : (
        <Tabela legenda="Tentativas de execução">
          <thead><tr><Th alinhar="direita">Nº</Th><Th>Data</Th><Th>Resultado</Th><Th>Motivo do insucesso</Th><Th>Registrada</Th>{editavel && <Th>Ação</Th>}</tr></thead>
          <tbody>
            {tentativas.map((t) => (
              <tr key={t.id}>
                <Td alinhar="direita">{t.numero}</Td>
                <Td>{data(t.data)}</Td>
                <Td>{t.sucesso ? <Etiqueta tom="ok">✓ Sucesso</Etiqueta> : <Etiqueta tom="critico">✗ Sem sucesso</Etiqueta>}</Td>
                <Td>{t.motivo_insucesso ?? '—'}</Td>
                <Td>{dataHora(t.criado_em)}{t.criado_por_nome ? ` · ${t.criado_por_nome}` : ''}</Td>
                {editavel && <Td><ExcluirTentativa numero={t.numero} acao={acaoExcluirTentativa.bind(null, reg.id, t.id)} /></Td>}
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
      {editavel && aberto && (
        <div className="mt-4 border-t border-pedra/50 pt-4">
          <FormTentativa acao={acaoTentativa.bind(null, reg.id)} hoje={hojeLocal()} />
        </div>
      )}
      {!aberto && <p className="mt-3 text-sm text-neutro">Movimento {String(reg.situacao) === 'CONCLUIDO' ? 'concluído' : 'cancelado'}: novas tentativas não se aplicam.</p>}
    </Card>
  )
}

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params
  return <PaginaRegistro def={entidade('comodato_movimento')} id={id} searchParams={searchParams}
    extras={(reg, ctx) => <Tentativas reg={reg} podeEditar={ctx.podeEditar} bloqueado={ctx.bloqueado} />} />
}
