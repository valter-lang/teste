import Link from 'next/link'
import { exigirLogin } from '@/lib/auth/sessao'
import { AcessoNegado, pode } from '@/lib/auth/permissoes'
import { dataHora } from '@/lib/format'
import { listarImportacoes } from '@/lib/importacao/consultas'
import { Alerta, Botao, Cabecalho, Campo, Card, Entrada, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { enviarPlanilha } from './acoes'
import { ROTULO_STATUS } from './rotulos'

export const metadata = { title: 'Migração da planilha' }

export default async function PaginaImportacao({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirLogin()
  if (!pode(u, 'importacao.executar') && !pode(u, 'importacao.homologar')) throw new AcessoNegado()
  const sp = await searchParams
  const lista = await listarImportacoes()
  const podeExecutar = pode(u, 'importacao.executar')

  return (
    <div className="flex flex-col gap-6">
      <Cabecalho
        titulo="Migração da planilha histórica"
        subtitulo="Importa o “Dashboard Executivo Manutenção, Comodato e T.I.” com conferência de totais, mapeamento de cadastros e homologação."
      />
      {sp.erro && <Alerta tom="critico" titulo="Não foi possível concluir">{sp.erro}</Alerta>}
      {sp.ok && <Alerta tom="ok">{sp.ok}</Alerta>}

      {podeExecutar && (
        <Card titulo="Enviar planilha">
          <form action={enviarPlanilha} className="flex flex-col gap-4 md:flex-row md:items-end">
            <Campo rotulo="Arquivo .xlsx" nome="arquivo" obrigatorio ajuda="Somente .xlsx, até 10 MB. A análise não grava dados: revise antes de gravar." className="flex-1">
              <Entrada id="arquivo" name="arquivo" type="file" required aria-describedby="arquivo-ajuda"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </Campo>
            <Botao type="submit">Analisar planilha</Botao>
          </form>
        </Card>
      )}

      <Card titulo="Importações">
        {lista.length === 0 ? (
          <Vazio>Nenhuma importação registrada.</Vazio>
        ) : (
          <Tabela legenda="Importações da planilha histórica">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Arquivo</Th>
                <Th>Situação</Th>
                <Th>Analisada em</Th>
                <Th>Por</Th>
                <Th>Gravada em</Th>
                <Th>Homologada</Th>
                <Th alinhar="direita">Pendências abertas</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id}>
                  <Td>{i.id}</Td>
                  <Td><Link className="font-semibold text-vinho underline" href={`/importacao/${i.id}`}>{i.arquivo_nome}</Link></Td>
                  <Td><Etiqueta tom={ROTULO_STATUS[i.status].tom}>{ROTULO_STATUS[i.status].texto}</Etiqueta></Td>
                  <Td>{dataHora(i.criado_em)}</Td>
                  <Td>{i.criado_por_nome ?? '—'}</Td>
                  <Td>{i.gravado_em ? dataHora(i.gravado_em) : '—'}</Td>
                  <Td>{i.homologado_em ? `${dataHora(i.homologado_em)} · ${i.homologado_por_nome ?? ''}` : '—'}</Td>
                  <Td alinhar="direita">{i.pendencias_abertas}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>
    </div>
  )
}
