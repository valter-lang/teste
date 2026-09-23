import 'server-only'
import { q1 } from './db'

/** Logotipo oficial enviado pelo administrador (arquivo aprovado). Nunca é gerado pelo sistema. */
export async function logotipoId(): Promise<string | null> {
  const r = await q1<{ valor: { arquivo_id?: string } }>(`select valor from configuracao where chave = 'identidade.logotipo'`)
  return r?.valor?.arquivo_id ?? null
}
