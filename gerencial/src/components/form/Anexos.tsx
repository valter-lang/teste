import { Card, Tabela, Td, Th, Vazio } from '@/components/ui'
import { dataHora, numero } from '@/lib/format'
import { EXTENSOES_ANEXO, listarAnexos } from '@/lib/anexos'
import { acaoEnviarAnexo, acaoExcluirAnexo } from '@/lib/operacao/acoes'
import { EnvioAnexo, RemoverAnexo } from './EnvioAnexo'

const tamanho = (b: number) => (b >= 1024 * 1024 ? `${numero(b / 1024 / 1024, 1)} MB` : `${numero(Math.max(1, b / 1024), 0)} KB`)

/** Anexos/evidências de um registro (lista + envio). Downloads via /api/arquivos/[id]. */
export async function Anexos({ chave, entidade, id, podeEditar }: { chave: string; entidade: string; id: number; podeEditar: boolean }) {
  const anexos = await listarAnexos(entidade, id)
  return (
    <Card titulo="Anexos e evidências">
      {anexos.length === 0 ? (
        <Vazio>Nenhum anexo.</Vazio>
      ) : (
        <Tabela legenda="Anexos do registro">
          <thead>
            <tr><Th>Arquivo</Th><Th>Descrição</Th><Th alinhar="direita">Tamanho</Th><Th>Enviado</Th>{podeEditar && <Th>Ação</Th>}</tr>
          </thead>
          <tbody>
            {anexos.map((a) => (
              <tr key={a.id}>
                <Td><a className="font-semibold text-vinho underline" href={`/api/arquivos/${a.arquivo_id}`}>{a.nome}</a>
                  <span className="block font-mono text-[10px] text-neutro" title="SHA-256">{a.sha256.slice(0, 16)}…</span></Td>
                <Td>{a.descricao ?? '—'}</Td>
                <Td alinhar="direita">{tamanho(a.tamanho)}</Td>
                <Td>{dataHora(a.criado_em)}{a.criado_por_nome ? ` · ${a.criado_por_nome}` : ''}</Td>
                {podeEditar && <Td><RemoverAnexo nome={a.nome} acao={acaoExcluirAnexo.bind(null, chave, id, a.id)} /></Td>}
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
      {podeEditar && (
        <div className="mt-4 border-t border-pedra/50 pt-4">
          <EnvioAnexo acao={acaoEnviarAnexo.bind(null, chave, id)} aceitos={EXTENSOES_ANEXO} />
        </div>
      )}
    </Card>
  )
}
