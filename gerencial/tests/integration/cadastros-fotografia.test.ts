import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1 } from '@/lib/db'
import { registrarFotografiaBaseAtiva } from '@/lib/integracoes/fotografia'

// Competência distante para não colidir com dados reais
const COMP = '2098-12-01'
let adminId: string

async function limpar() {
  await q(`update periodo_area set status = 'EM_PREENCHIMENTO' where competencia = $1 and area_codigo = 'COMODATO'`, [COMP])
  await q('delete from comodato_base_ativa where competencia = $1', [COMP])
  await q(`delete from periodo_area where competencia = $1 and area_codigo = 'COMODATO'`, [COMP])
}

beforeAll(async () => {
  adminId = (await q1<{ id: string }>(`select u.id from usuario u join usuario_papel p on p.usuario_id = u.id where p.papel = 'ADMIN' order by u.criado_em limit 1`))!.id
  await limpar()
})
afterAll(async () => {
  await limpar()
  await pool().end()
  delete (globalThis as { __clPool?: unknown }).__clPool
})

describe('fotografia mensal da base instalada', () => {
  it('registra com origem INTEGRACAO e substitui a anterior por exclusão lógica', async () => {
    const r1 = await registrarFotografiaBaseAtiva(COMP, { equipamentos: 120, clientes: 40, lojas: 55 }, adminId, new Date('2098-12-05T12:00:00Z'))
    expect(r1.ok).toBe(true)
    const r2 = await registrarFotografiaBaseAtiva(COMP, { equipamentos: 125, clientes: 41, lojas: 56 }, adminId)
    expect(r2.ok).toBe(true)
    const linhas = await q<{ equipamentos_ativos: number; origem: string; evidencia: string; excluido_em: Date | null }>(
      'select equipamentos_ativos, origem, evidencia, excluido_em from comodato_base_ativa where competencia = $1 order by id', [COMP])
    expect(linhas).toHaveLength(2)
    expect(linhas[0].excluido_em).not.toBeNull()
    expect(linhas[1]).toMatchObject({ equipamentos_ativos: 125, origem: 'INTEGRACAO', excluido_em: null })
    expect(linhas[0].evidencia).toBe('bd_cl_inv em 05/12/2098, 09:00')
  })

  it('recusa quando o período de Comodato está aprovado/fechado', async () => {
    await q(`insert into periodo_area (competencia, area_codigo, status) values ($1, 'COMODATO', 'FECHADO')
             on conflict (competencia, area_codigo) do update set status = 'FECHADO'`, [COMP])
    const r = await registrarFotografiaBaseAtiva(COMP, { equipamentos: 1, clientes: 1, lojas: 1 }, adminId)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/fechado/)
  })

  it('não sobrescreve base ativa lançada manualmente', async () => {
    await limpar()
    await q(`insert into comodato_base_ativa (competencia, equipamentos_ativos, origem) values ($1, 10, 'MANUAL')`, [COMP])
    const r = await registrarFotografiaBaseAtiva(COMP, { equipamentos: 1, clientes: 1, lojas: 1 }, adminId)
    expect(r.ok).toBe(false)
  })
})
