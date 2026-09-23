/**
 * Gera docs/catalogo-indicadores.md (do catálogo versionado no código) e
 * docs/dicionario-dados.md (do esquema do banco em DATABASE_URL).
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { INDICADORES, METAS_INICIAIS } from '../src/lib/indicadores/catalogo'

const AREA: Record<string, string> = { MANUT_INTERNA: 'Manutenção interna', MANUT_EXTERNA: 'Manutenção externa', ESTOQUE_PECAS: 'Estoque de peças', COMODATO: 'Comodato', TI: 'TI' }
const esc = (s: string | undefined | null) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function catalogo() {
  const linhas: string[] = ['# Catálogo de indicadores', '', 'Gerado por `scripts/gerar-docs.ts` a partir de `src/lib/indicadores/catalogo.ts` (versão 1). Em produção, a fonte da verdade são as tabelas `indicador_definicao` e `meta`, versionadas.', '']
  for (const classe of ['ESSENCIAL', 'COMPLEMENTAR', 'OPERACIONAL', 'CANDIDATO'] as const) {
    const itens = INDICADORES.filter((i) => i.classe === classe)
    linhas.push(`## ${{ ESSENCIAL: 'Essenciais (painel da Diretoria)', COMPLEMENTAR: 'Complementares', OPERACIONAL: 'Operacionais (séries dos painéis)', CANDIDATO: 'Candidatos — desativados até homologação' }[classe]}`, '')
    linhas.push('| Código | Indicador | Área | Unidade | Fórmula | Consolidação | Direção | Metas iniciais | Pendências |', '|---|---|---|---|---|---|---|---|---|')
    for (const i of itens) {
      const metas = METAS_INICIAIS.filter((m) => m.indicador === i.codigo)
        .map((m) => `${m.ciclo.toLowerCase()}: ${m.tipo === 'TENDENCIA_QUEDA' ? 'tendência de queda' : `${m.operador} ${m.valor ?? '?'}${m.valorMax !== undefined ? `–${m.valorMax}` : ''}${m.tipo !== 'ABSOLUTA' && m.tipo !== 'CONTAGEM_MINIMA' ? ` (${m.tipo.toLowerCase().replace(/_/g, ' ')})` : ''}`}${m.status === 'PROPOSTA' ? ' **[proposta]**' : ''}`).join('<br>')
      linhas.push(`| \`${i.codigo}\` | ${esc(i.nome)} | ${AREA[i.area]} | ${i.unidade} | ${esc(i.formula)} | ${i.consolidacao} | ${i.direcao} | ${metas || '—'} | ${esc(i.pendencias) || '—'} |`)
    }
    linhas.push('')
  }
  linhas.push('## Semáforo', '', '- Verde: atingiu a meta.', '- Amarelo: fora da meta dentro da tolerância (padrão 5%, relativa à meta e na direção do indicador). Ex.: meta ≥ 95% → amarelo de 90,25% a 94,99%; meta ≤ 5% → amarelo acima de 5% até 5,25%.', '- Vermelho: além da tolerância — exige plano de ação.', '- N/A: sem dado ou denominador zero (nunca verde). Sem meta homologada: status neutro.', '')
  return linhas.join('\n')
}

async function dicionario() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const cols = await c.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
    `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name not in ('schema_migracao') order by table_name, ordinal_position`)
  const cks = await c.query<{ tabela: string; def: string }>(
    `select conrelid::regclass::text as tabela, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace order by 1`)
  const trg = await c.query<{ tabela: string; nome: string }>(`select event_object_table as tabela, trigger_name as nome from information_schema.triggers where trigger_schema = 'public' group by 1, 2 order by 1, 2`)
  await c.end()
  const tabelas = [...new Set(cols.rows.map((r) => r.table_name))]
  const out = ['# Dicionário de dados', '', 'Gerado por `scripts/gerar-docs.ts` a partir do esquema aplicado pelas migrations em `db/migrations/`.', '']
  for (const t of tabelas) {
    out.push(`## ${t}`, '', '| Coluna | Tipo | Nulo | Padrão |', '|---|---|---|---|')
    for (const c2 of cols.rows.filter((r) => r.table_name === t)) out.push(`| ${c2.column_name} | ${c2.data_type} | ${c2.is_nullable === 'YES' ? 'sim' : 'não'} | ${esc(c2.column_default?.slice(0, 60))} |`)
    const regras = cks.rows.filter((r) => r.tabela === t)
    if (regras.length) out.push('', '**Regras (CHECK):**', '', ...regras.map((r) => `- \`${esc(r.def)}\``))
    const ts = trg.rows.filter((r) => r.tabela === t).map((r) => r.nome)
    if (ts.length) out.push('', `**Triggers:** ${ts.join(', ')}`)
    out.push('')
  }
  return out.join('\n')
}

;(async () => {
  const dir = path.join(__dirname, '..', 'docs')
  writeFileSync(path.join(dir, 'catalogo-indicadores.md'), catalogo())
  if (process.env.DATABASE_URL) writeFileSync(path.join(dir, 'dicionario-dados.md'), await dicionario())
  console.log('Documentação gerada.')
})()
