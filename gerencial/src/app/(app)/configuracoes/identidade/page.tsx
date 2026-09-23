/* eslint-disable @next/next/no-img-element */
import { exigirPermissao } from '@/lib/auth/sessao'
import { Alerta, Card, Campo, Etiqueta } from '@/components/ui'
import { dataHora } from '@/lib/format'
import { lerLogotipo } from '@/lib/cadastros/logotipo-db'
import { FormAcao } from '../../cadastros/_ui/FormAcao'
import { AcaoRapida } from '../../cadastros/_ui/AcaoRapida'
import { CabecalhoConfig } from '../_abas'
import { enviarLogotipoAcao, removerLogotipoAcao } from '../acoes'

export const metadata = { title: 'Identidade visual' }

export default async function PaginaIdentidade() {
  const u = await exigirPermissao('configuracao.editar')
  const logo = await lerLogotipo()
  const arquivoId = logo?.valor?.arquivo_id ?? null
  return (
    <div>
      <CabecalhoConfig u={u} ativo="identidade" subtitulo="Logotipo exibido no menu e nos relatórios exportados." />
      <div className="mb-4">
        <Alerta tom="atencao" titulo="Arquivo oficial">Use apenas o arquivo oficial aprovado; o sistema não gera nem redesenha o logotipo.</Alerta>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card titulo="Logotipo atual" acoes={arquivoId ? (logo?.valor?.aprovado ? <Etiqueta tom="ok">✓ Oficial aprovado</Etiqueta> : <Etiqueta tom="atencao">! Não aprovado</Etiqueta>) : undefined}>
          {arquivoId ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex h-28 min-w-40 items-center justify-center rounded-md border border-pedra bg-branco p-3">
                  <img src={`/api/arquivos/${arquivoId}`} alt="Logotipo oficial em fundo claro" className="max-h-20 w-auto object-contain" />
                </div>
                <div className="flex h-28 min-w-40 items-center justify-center rounded-md bg-vinho p-3">
                  <img src={`/api/arquivos/${arquivoId}`} alt="Logotipo oficial sobre o fundo do menu" className="max-h-20 w-auto object-contain" />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-neutro">Arquivo</dt><dd>{logo?.arquivo_nome ?? '—'}</dd>
                <dt className="text-neutro">Tamanho</dt><dd>{logo?.tamanho ? `${(logo.tamanho / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB` : '—'}</dd>
                <dt className="text-neutro">Enviado por</dt><dd>{logo?.enviado_por_nome ?? '—'}</dd>
                <dt className="text-neutro">Enviado em</dt><dd>{logo?.valor?.enviado_em ? dataHora(logo.valor.enviado_em) : '—'}</dd>
              </dl>
              <div>
                <AcaoRapida acao={removerLogotipoAcao} campos={{}} rotulo="Deixar de usar este logotipo" variante="perigo"
                  confirmar="Remover o logotipo das telas? O arquivo permanece armazenado para histórico." />
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutro">Nenhum logotipo oficial enviado. O menu exibe apenas o nome “Costa Lavos” em texto.</p>
          )}
        </Card>
        <Card titulo="Enviar arquivo oficial">
          <FormAcao acao={enviarLogotipoAcao} rotuloBotao="Enviar logotipo">
            <Campo rotulo="Arquivo (PNG, SVG ou JPG, até 2 MB)" nome="arquivo" obrigatorio ajuda="O conteúdo é verificado (assinatura do arquivo). SVG com scripts ou eventos é recusado.">
              <input id="arquivo" name="arquivo" type="file" required accept=".png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg"
                aria-describedby="arquivo-ajuda"
                className="text-sm file:mr-3 file:rounded-md file:border file:border-pedra file:bg-branco file:px-3 file:py-1.5 file:font-semibold" />
            </Campo>
            <label className="inline-flex items-start gap-2 text-sm">
              <input type="checkbox" name="oficial" required className="mt-0.5 h-4 w-4 accent-vinho" />
              <span>Declaro que este é o arquivo oficial do logotipo, aprovado pela Costa Lavos, sem alterações.</span>
            </label>
          </FormAcao>
        </Card>
      </div>
    </div>
  )
}
