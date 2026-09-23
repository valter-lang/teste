/**
 * Importador da planilha histórica (linha de comando).
 *
 *   npx tsx scripts/importar-planilha.ts <arquivo.xlsx> --usuario <email> [--gravar]
 *
 * Sem --gravar: apenas analisa e registra (status ANALISADA).
 * Com --gravar: aceita todas as propostas de mapeamento e grava (status GRAVADA).
 * Nunca imprime dados pessoais: somente contagens, séries e totais.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { pool, q1 } from '../src/lib/db'
import { analisarERegistrar, gravarImportacao } from '../src/lib/importacao/gravar'
import { resumoAnalise } from '../src/lib/importacao/planilha'

function argumentos() {
  const a = process.argv.slice(2)
  const arquivo = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--usuario')
  const i = a.indexOf('--usuario')
  return { arquivo, usuario: i >= 0 ? a[i + 1] : undefined, gravar: a.includes('--gravar') }
}

const pad = (s: unknown, n: number) => String(s).padEnd(n).slice(0, n)
const padE = (s: unknown, n: number) => String(s).padStart(n).slice(-n)

async function main() {
  const { arquivo, usuario, gravar } = argumentos()
  if (!arquivo || !usuario) {
    console.error('Uso: npx tsx scripts/importar-planilha.ts <arquivo.xlsx> --usuario <email> [--gravar]')
    process.exit(2)
  }
  const u = await q1<{ id: string }>('select id from usuario where lower(email) = lower($1) and ativo', [usuario])
  if (!u) throw new Error('Usuário não encontrado ou inativo.')
  const buffer = readFileSync(arquivo)
  const { importacaoId, analise } = await analisarERegistrar(buffer, basename(arquivo), u.id)
  const r = resumoAnalise(analise)

  console.log(`\nImportação #${importacaoId} registrada (ANALISADA) — sha256 ${r.arquivo.sha256.slice(0, 12)}…`)
  console.log('\nLinhas por série (historico_agregado):')
  for (const [s, v] of Object.entries(r.series)) console.log(`  ${pad(s, 24)} ${padE(v.linhas, 5)} linhas   soma ${v.soma.toLocaleString('pt-BR')}`)
  console.log(`\nDetalhes: ${Object.entries(r.detalhes).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`Trocas: ${r.trocas} | Posições de comodato: ${r.posicoesComodato}`)
  console.log(`Chamados TI: ${r.chamadosTi.total} (TI ${r.chamadosTi.ti}, Linear ${r.chamadosTi.linear}, outros ${r.chamadosTi.outros}, teste ${r.chamadosTi.teste})`)
  console.log(`Propostas de mapeamento: ${r.propostasMapeamento.length} (${r.propostasMapeamento.map((p) => `${p.chave} -> ${p.sugestao ?? p.acao}`).join('; ')})`)
  console.log(`\nPendências por tipo: ${Object.entries(r.pendencias).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`Totais/médias conferidos: ${r.totaisConferidos.length}, divergentes: ${r.totaisDivergentes}`)
  for (const t of r.totaisConferidos.filter((x) => !x.confere)) console.log(`  DIVERGE ${t.aba}!${t.celula} ${t.descricao}: planilha ${t.valorPlanilha} x calculado ${t.valorCalculado}`)

  if (gravar) {
    const g = await gravarImportacao(importacaoId, u.id, { aceitarPropostas: true })
    console.log(`\nGravada: ${g.propostasAplicadas} proposta(s) aplicada(s), ${g.naoGravados} registro(s) não gravado(s) por duplicidade.`)
    const div = g.reconciliacao.filter((x) => !x.confere)
    console.log(`\nReconciliação planilha x sistema: ${g.reconciliacao.length} verificações, ${div.length} divergência(s)`)
    console.log(`  ${pad('Aba', 16)} ${pad('Série', 44)} ${pad('Comp.', 8)} ${padE('Planilha', 12)} ${padE('Sistema', 12)} ${padE('Dif.', 9)}  Situação`)
    for (const x of g.reconciliacao) {
      console.log(`  ${pad(x.aba, 16)} ${pad(x.serie, 44)} ${pad(x.competencia?.slice(0, 7) ?? '—', 8)} ${padE(x.planilha, 12)} ${padE(x.sistema, 12)} ${padE(x.diferenca, 9)}  ${x.confere ? 'confere' : 'DIVERGE'}`)
    }
  } else {
    console.log('\nNada gravado (use --gravar para gravar).')
  }
}

main()
  .catch((e) => {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    process.exitCode = 1
  })
  .finally(() => pool().end())
