import Link from 'next/link'
import { exigirLogin } from '@/lib/auth/sessao'
import { pode } from '@/lib/auth/permissoes'
import { Cabecalho, Card, Etiqueta, Grade, Tabela, Td, Th, Vazio } from '@/components/ui'
import { dataHora, numero } from '@/lib/format'
import { pendenciasHomologacao } from '@/lib/homologacao/consultas'
import { PENDENCIAS_DOCUMENTAIS, type StatusPendencia } from '@/lib/homologacao/pendencias-documentais'
import { PARAMETROS } from '@/lib/cadastros/parametros'

export const metadata = { title: 'Pendências de homologação' }

const STATUS_DOC: Record<StatusPendencia, { rotulo: string; tom: 'atencao' | 'vinho' | 'ok' }> = {
  ABERTA: { rotulo: '! Aberta', tom: 'atencao' },
  EM_ANALISE: { rotulo: '… Em análise', tom: 'vinho' },
  RESOLVIDA: { rotulo: '✓ Resolvida', tom: 'ok' },
}

const TIPOS_PENDENCIA: Record<string, string> = {
  SEM_MAPEAMENTO: 'Sem mapeamento', VALOR_INVALIDO: 'Valor inválido', FORMULA_INVALIDA: 'Fórmula inválida', DUPLICIDADE: 'Duplicidade',
  TOTAL_INCOMPATIVEL: 'Total incompatível', DADO_TESTE: 'Dado de teste', CONCILIACAO: 'Conciliação', DIVERGENCIA_FONTE: 'Divergência de fonte',
  INFORMATIVO: 'Informativo',
}

function rotuloConfig(chave: string) {
  if (chave === 'calendario.expediente') return 'Expediente oficial (horas úteis)'
  if (chave === 'identidade.logotipo') return 'Logotipo oficial'
  return PARAMETROS.find((p) => p.chave === chave)?.rotulo ?? chave
}

function descreverMeta(m: { operador: string; valor: number | null; valor_max: number | null; tipo: string }) {
  if (m.valor === null) return 'Sem valor definido'
  const v = numero(m.valor, 2).replace(/,00$/, '')
  if (m.operador === 'ENTRE') return `entre ${v} e ${numero(m.valor_max, 2).replace(/,00$/, '')}`
  return `${m.operador} ${v}${m.tipo === 'PERCENTUAL_SOBRE_LINHA_BASE' || m.tipo === 'VARIACAO_PERIODO_ANTERIOR' ? '% ' : ' '}(${m.tipo.toLowerCase().replaceAll('_', ' ')})`
}

export default async function PaginaHomologacao() {
  const u = await exigirLogin()
  const p = await pendenciasHomologacao()
  const podeConfig = pode(u, 'configuracao.editar')
  const totalPendImport = p.pendenciasImportacao.reduce((s, x) => s + x.quantidade, 0)
  const resumo = [
    { rotulo: 'Indicadores não homologados', valor: p.indicadores.length, ancora: '#indicadores' },
    { rotulo: 'Metas propostas', valor: p.metas.length, ancora: '#metas' },
    { rotulo: 'Configurações pendentes', valor: p.configuracoes.length, ancora: '#configuracoes' },
    { rotulo: 'Importações a homologar', valor: p.importacoes.length, ancora: '#importacoes' },
    { rotulo: 'Pendências documentais', valor: PENDENCIAS_DOCUMENTAIS.filter((d) => d.status !== 'RESOLVIDA').length, ancora: '#documentais' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho titulo="Pendências de homologação"
        subtitulo="Tudo o que ainda depende de decisão ou validação formal antes de ser tratado como oficial. Itens pendentes aparecem sinalizados nos painéis e relatórios." />
      <nav aria-label="Resumo das pendências">
        <Grade cols={4} className="xl:grid-cols-5">
          {resumo.map((r) => (
            <a key={r.ancora} href={r.ancora} className="rounded-[var(--radius-card)] border border-pedra/60 bg-branco p-4 shadow-[var(--shadow-card)] hover:border-vinho">
              <p className="text-3xl font-extrabold tabular text-vinho">{numero(r.valor)}</p>
              <p className="text-sm font-semibold">{r.rotulo}</p>
            </a>
          ))}
        </Grade>
      </nav>

      <Card id="indicadores" titulo={`Indicadores com definição não homologada (${p.indicadores.length})`}>
        {p.indicadores.length === 0 ? <Vazio>Todas as definições de indicadores estão homologadas.</Vazio> : (
          <Tabela legenda="Indicadores não homologados">
            <thead><tr><Th>Indicador</Th><Th>Área</Th><Th>Classe</Th><Th>Pendências</Th></tr></thead>
            <tbody>
              {p.indicadores.map((i) => (
                <tr key={`${i.codigo}-${i.versao}`}>
                  <Td><span className="font-semibold">{i.nome}</span><br /><code className="text-xs text-neutro">{i.codigo} v{i.versao}</code></Td>
                  <Td>{i.area_nome}</Td>
                  <Td>{i.classe.charAt(0) + i.classe.slice(1).toLowerCase()}</Td>
                  <Td className="text-sm">{i.pendencias ?? <span className="text-neutro">Aguardando homologação da definição (sem pendência específica registrada).</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <Card id="metas" titulo={`Metas com status PROPOSTA (${p.metas.length})`} acoes={<Link className="text-sm font-semibold text-vinho hover:underline" href="/metas">Ir para Metas →</Link>}>
        {p.metas.length === 0 ? <Vazio>Nenhuma meta aguardando aprovação.</Vazio> : (
          <Tabela legenda="Metas propostas">
            <thead><tr><Th>Indicador</Th><Th>Ciclo</Th><Th>Meta proposta</Th><Th>Fonte</Th><Th>Motivo</Th></tr></thead>
            <tbody>
              {p.metas.map((m) => (
                <tr key={m.id}>
                  <Td><span className="font-semibold">{m.indicador_nome ?? m.indicador_codigo}</span></Td>
                  <Td>{m.ciclo.charAt(0) + m.ciclo.slice(1).toLowerCase()}</Td>
                  <Td>{descreverMeta(m)}</Td>
                  <Td className="text-sm">{m.fonte_documento}</Td>
                  <Td className="text-sm">{m.motivo}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <Card id="configuracoes" titulo={`Configurações pendentes (${p.configuracoes.length})`}
        acoes={podeConfig && <Link className="text-sm font-semibold text-vinho hover:underline" href="/configuracoes/parametros">Ir para Parâmetros →</Link>}>
        {p.configuracoes.length === 0 ? <Vazio>Todas as configurações estão homologadas.</Vazio> : (
          <ul className="flex flex-col divide-y divide-pedra/50">
            {p.configuracoes.map((c) => (
              <li key={c.chave} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{rotuloConfig(c.chave)}</p>
                  <p className="text-sm text-neutro">{c.descricao ?? '—'}</p>
                </div>
                <span className="flex flex-col items-end gap-1 text-xs text-neutro">
                  <Etiqueta tom="atencao">! Pendente</Etiqueta>
                  {c.atualizado_em ? `Atualizado em ${dataHora(c.atualizado_em)}` : 'Não gravado'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card id="importacoes" titulo={`Migração da planilha (${p.importacoes.length} importação(ões) não homologada(s))`}
        acoes={(pode(u, 'importacao.executar') || pode(u, 'importacao.homologar')) && <Link className="text-sm font-semibold text-vinho hover:underline" href="/importacao">Ir para Migração →</Link>}>
        {p.importacoes.length === 0 ? <Vazio>Nenhuma importação aguardando homologação.</Vazio> : (
          <Tabela legenda="Importações não homologadas">
            <thead><tr><Th>Arquivo</Th><Th>Status</Th><Th>Enviada em</Th><Th alinhar="direita">Pendências abertas</Th></tr></thead>
            <tbody>
              {p.importacoes.map((i) => (
                <tr key={i.id}>
                  <Td>{i.arquivo_nome}</Td>
                  <Td><Etiqueta tom="atencao">{i.status.charAt(0) + i.status.slice(1).toLowerCase()}</Etiqueta></Td>
                  <Td>{dataHora(i.criado_em)}</Td>
                  <Td alinhar="direita">{numero(i.pendencias_abertas)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        {p.pendenciasImportacao.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold">Pendências de importação em aberto por tipo ({numero(totalPendImport)})</h3>
            <ul className="flex flex-wrap gap-2">
              {p.pendenciasImportacao.map((t) => (
                <li key={t.tipo}><Etiqueta tom="vinho">{TIPOS_PENDENCIA[t.tipo] ?? t.tipo}: {numero(t.quantidade)}</Etiqueta></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card id="documentais" titulo="Pendências documentais">
        <p className="mb-3 text-sm text-neutro">Lacunas entre a especificação, os documentos entregues e os dados disponíveis, registradas durante a construção do sistema.</p>
        <ol className="flex flex-col gap-3">
          {PENDENCIAS_DOCUMENTAIS.map((d) => (
            <li key={d.id} className="rounded-md border border-pedra/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold"><span className="mr-2 font-mono text-xs text-neutro">{d.id}</span>{d.titulo}</h3>
                <Etiqueta tom={STATUS_DOC[d.status].tom}>{STATUS_DOC[d.status].rotulo}</Etiqueta>
              </div>
              <p className="mt-1 text-sm">{d.descricao}</p>
              <p className="mt-1 text-sm"><strong>Impacto:</strong> {d.impacto}</p>
              <p className="mt-1 text-xs text-neutro">Responsável sugerido: {d.responsavel.join(', ')}</p>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-xs text-neutro">Consulta gerada em {dataHora(new Date())}.</p>
    </div>
  )
}
