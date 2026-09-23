/**
 * Worker da central de relatórios (produção): processa a fila relatorio_job.
 * Consulta a cada 3 s; encerra de forma limpa em SIGTERM/SIGINT (termina o job em andamento).
 * Uso: npm run worker
 */
import { processarProximo } from '../src/lib/relatorios/fila'
import { pool } from '../src/lib/db'

let parar = false
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    if (parar) process.exit(1)
    console.log(`[worker] ${sinal} recebido: encerrando após o job atual...`)
    parar = true
  })
}

async function main() {
  console.log('[worker] central de relatórios iniciada')
  while (!parar) {
    try {
      const job = await processarProximo()
      if (job) {
        console.log(`[worker] job ${job.id} ${job.formato}/${job.escopo}/${job.modo}: ${job.status}${job.arquivo_nome ? ` (${job.arquivo_nome})` : ''}`)
        continue
      }
    } catch (e) {
      console.error('[worker] falha ao consultar a fila:', (e as Error).message)
    }
    await dormir(3000)
  }
  await pool().end()
  console.log('[worker] encerrado')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
