/**
 * Ciclo completo da importação contra um banco migrado e semeado (DATABASE_URL).
 * Cria somente dados próprios (arquivo "sintetica-*.xlsx") e os remove ao final.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, q, q1 } from '@/lib/db'
import { analisarPlanilha } from '@/lib/importacao/planilha'
import {
  carregarCatalogoFamilias, descartarImportacao, gravarImportacao, homologarImportacao, pendenciasBloqueantes, registrarAnalise, resolverPendencia,
} from '@/lib/importacao/gravar'
import { relatorioReconciliacao } from '@/lib/importacao/reconciliacao'
import { gerarPlanilhaSintetica } from '../fixtures/gerarPlanilhaSintetica'

const temBanco = !!process.env.DATABASE_URL
const NOME = 'sintetica-integracao.xlsx'

let usuarioId: string
let buffer: Buffer
const antes: Record<string, number> = {}
let aliasesAntes: string[] = []

async function registrar() {
  const analise = await analisarPlanilha(buffer, NOME, await carregarCatalogoFamilias())
  return (await registrarAnalise(null, analise, buffer, usuarioId)).importacaoId
}

async function limparSinteticas() {
  const ativas = await q<{ id: number; status: string }>(`select id, status from importacao where arquivo_nome like 'sintetica%' and status <> 'DESCARTADA'`)
  for (const i of ativas) await descartarImportacao(i.id, usuarioId, 'limpeza de teste')
}

describe.skipIf(!temBanco)('importação histórica (integração)', () => {
  beforeAll(async () => {
    const u = await q1<{ id: string }>(`select u.id from usuario u join usuario_papel p on p.usuario_id = u.id where p.papel = 'ADMIN' limit 1`)
    if (!u) throw new Error('Banco sem usuário ADMIN (rode o seed com ADMIN_EMAIL/ADMIN_SENHA).')
    usuarioId = u.id
    buffer = await gerarPlanilhaSintetica()
    await limparSinteticas()
    const outra = await q1<{ id: number }>(`select id from importacao where status in ('GRAVADA','HOMOLOGADA') limit 1`)
    if (outra) throw new Error(`A importação #${outra.id} ocupa o histórico neste banco; use um banco de teste limpo.`)
    for (const t of ['familia_equipamento', 'familia_peca', 'tecnico', 'rede']) antes[t] = Number((await q1<{ m: number }>(`select coalesce(max(id),0) as m from ${t}`))!.m)
    aliasesAntes = (await q<{ alias: string }>('select alias from familia_equipamento_alias')).map((r) => r.alias)
  })

  afterAll(async () => {
    if (!usuarioId) return pool().end()
    await limparSinteticas()
    const ids = (await q<{ id: number; arquivo_id: string }>(`select id, arquivo_id from importacao where arquivo_nome like 'sintetica%'`))
    await q('delete from importacao_pendencia where importacao_id = any($1::int[])', [ids.map((i) => i.id)])
    await q('delete from importacao where id = any($1::int[])', [ids.map((i) => i.id)])
    await q('delete from arquivo where id = any($1::uuid[])', [ids.map((i) => i.arquivo_id)])
    await q('delete from familia_equipamento_alias where not (alias = any($1::text[]))', [aliasesAntes])
    for (const [t, m] of Object.entries(antes)) await q(`delete from ${t} where id > $1`, [m])
    await pool().end()
  })

  let id1: number

  it('registra a análise com pendências e bloqueia a mesma planilha enquanto gravada', async () => {
    id1 = await registrar()
    const imp = await q1<{ status: string; resumo: { chamadosTi: { total: number } } }>('select status, resumo from importacao where id = $1', [id1])
    expect(imp!.status).toBe('ANALISADA')
    expect(imp!.resumo.chamadosTi.total).toBe(9)
    const n = await q1<{ n: number }>('select count(*)::int as n from importacao_pendencia where importacao_id = $1', [id1])
    expect(n!.n).toBeGreaterThan(5)
    // Nada foi gravado ainda
    expect((await q1<{ n: number }>('select count(*)::int as n from historico_agregado where importacao_id = $1', [id1]))!.n).toBe(0)
  })

  it('grava todas as tabelas de destino com origem e reconciliação 100% conferida', async () => {
    const g = await gravarImportacao(id1, usuarioId, { aceitarPropostas: true })
    expect(g.reconciliacao.length).toBeGreaterThan(50)
    expect(g.reconciliacao.filter((r) => !r.confere)).toEqual([])
    const rec = await relatorioReconciliacao(id1)
    expect(rec.every((r) => r.confere)).toBe(true)
    const imp = await q1<{ status: string; reconciliacao: unknown[] }>('select status, reconciliacao from importacao where id = $1', [id1])
    expect(imp!.status).toBe('GRAVADA')
    expect(imp!.reconciliacao).toHaveLength(rec.length)

    const h = await q1<{ valor: number; aba: string; celula: string; dimensao_id: number | null }>(
      `select valor, aba, celula, dimensao_id from historico_agregado where importacao_id = $1 and serie = 'MI_SUCATEADOS' and dimensao_valor = 'ARMARIO' and competencia = '2026-07-01'`, [id1])
    expect(h).toMatchObject({ valor: 48, aba: 'Equipe Interna' })
    const armario = await q1<{ id: number }>(`select id from familia_equipamento where nome = 'ARMARIO/ESQUELETO'`)
    expect(h!.dimensao_id).toBe(armario!.id)
    const tec = await q1<{ tipo: string }>(`select t.tipo from historico_agregado h join tecnico t on t.id = h.dimensao_id where h.importacao_id = $1 and h.dimensao_valor = 'TERCEIRO' limit 1`, [id1])
    expect(tec!.tipo).toBe('TERCEIRO')

    const troca = await q1<{ status: string; familia_id: number | null; origem_ref: Record<string, unknown> }>(
      `select status, familia_id, origem_ref from solicitacao_troca where origem = 'IMPORTACAO' and cliente_texto = 'LOJA TROCA 5'`)
    expect(troca!.status).toBe('PENDENTE')
    expect(troca!.origem_ref).toMatchObject({ arquivo: NOME, aba: 'Equipe Externa', importacao_id: id1 })
    expect(troca!.familia_id).toBe((await q1<{ id: number }>(`select id from familia_equipamento where nome = 'FORNO'`))!.id)

    const pos = await q1<{ ajuste: number; justificativa_ajuste: string }>(
      `select ajuste, justificativa_ajuste from comodato_posicao where origem = 'IMPORTACAO' and competencia = '2026-08-01' and produto = 'FREEZER'`)
    expect(pos!.ajuste).toBe(1)

    const ti = await q1<{ aberto_em: Date; dado_teste: boolean; email_tecnico: string }>(
      `select c.aberto_em, c.dado_teste, r.email_tecnico from chamado_ti c join chamado_ti_restrito r on r.chamado_id = c.id where c.numero = 'TI-2026080001'`)
    expect(ti!.aberto_em.toISOString()).toBe('2026-08-31T19:58:10.000Z')
    expect(ti!.email_tecnico).toBe('tecnico.ficticio@exemplo.test')
    expect((await q1<{ dado_teste: boolean }>(`select dado_teste from chamado_ti where numero = 'TI-2026080003'`))!.dado_teste).toBe(true)
    // Dados restritos não vão para a trilha de auditoria
    const aud = await q1<{ n: number }>(`select count(*)::int as n from auditoria where tabela = 'chamado_ti_restrito' and depois::text like '%exemplo.test%'`)
    expect(aud!.n).toBe(0)
    // Pendência da proposta aceita ficou resolvida; a manual não
    const prop = await q<{ resolvida: boolean; proposta: string }>(
      `select resolvida, valor_bruto->>'proposta' as proposta from importacao_pendencia where importacao_id = $1 and valor_bruto ? 'proposta'`, [id1])
    expect(prop.find((p) => p.proposta === 'FORNO E FREEZER')?.resolvida).toBe(false)
    expect(prop.filter((p) => p.proposta !== 'FORNO E FREEZER').every((p) => p.resolvida)).toBe(true)
    expect(prop.length).toBeGreaterThan(1)
  })

  it('impede registrar novamente o mesmo arquivo enquanto a importação está gravada', async () => {
    await expect(registrar()).rejects.toThrow(/já foi gravado/)
  })

  it('descartar remove todas as linhas gravadas e libera nova importação', async () => {
    await expect(descartarImportacao(id1, usuarioId)).rejects.toThrow(/motivo/)
    const r = await descartarImportacao(id1, usuarioId, 'nova versão da planilha')
    expect(r.removidos.historico_agregado).toBeGreaterThan(100)
    for (const [sql, p] of [
      ['select count(*)::int as n from historico_agregado where importacao_id = $1', [id1]],
      ['select count(*)::int as n from historico_detalhe where importacao_id = $1', [id1]],
      [`select count(*)::int as n from solicitacao_troca where origem_ref->>'importacao_id' = $1`, [String(id1)]],
      [`select count(*)::int as n from comodato_posicao where origem_ref->>'importacao_id' = $1`, [String(id1)]],
      [`select count(*)::int as n from chamado_ti where origem_ref->>'importacao_id' = $1`, [String(id1)]],
    ] as [string, unknown[]][]) expect((await q1<{ n: number }>(sql, p))!.n).toBe(0)
    expect((await q1<{ status: string }>('select status from importacao where id = $1', [id1]))!.status).toBe('DESCARTADA')
    await expect(descartarImportacao(id1, usuarioId, 'de novo')).rejects.toThrow(/já descartada/)
  })

  it('homologação exige GRAVADA, observação e resolução das pendências de total/conciliação', async () => {
    const id2 = await registrar()
    await expect(homologarImportacao(id2, usuarioId, 'ok')).rejects.toThrow(/GRAVADAS/)
    await gravarImportacao(id2, usuarioId, { aceitarPropostas: false, propostasAceitas: ['ARMARIO'] })
    // "FORNO E FREEZER" (decisão manual) nunca recebe família
    const amb = await q1<{ familia_id: number | null }>(`select familia_id from solicitacao_troca where origem_ref->>'importacao_id' = $1 and equipamento_texto = 'FORNO E FREEZER'`, [String(id2)])
    expect(amb!.familia_id).toBeNull()
    await expect(homologarImportacao(id2, usuarioId, '  ')).rejects.toThrow(/obrigatória/)
    const bloq = await pendenciasBloqueantes(id2)
    expect(bloq.map((b) => b.tipo)).toEqual(['CONCILIACAO'])
    await expect(homologarImportacao(id2, usuarioId, 'Conferido com a planilha')).rejects.toThrow(/pendência/)
    await expect(resolverPendencia(bloq[0].id, usuarioId, ' ')).rejects.toThrow(/resolução/)
    await resolverPendencia(bloq[0].id, usuarioId, 'Diferença de 1 unidade confirmada com o almoxarifado')
    await homologarImportacao(id2, usuarioId, 'Conferido com a planilha')
    const imp = await q1<{ status: string; homologado_por: string; observacao_homologacao: string }>('select status, homologado_por, observacao_homologacao from importacao where id = $1', [id2])
    expect(imp).toMatchObject({ status: 'HOMOLOGADA', homologado_por: usuarioId, observacao_homologacao: 'Conferido com a planilha' })
    await expect(resolverPendencia(bloq[0].id, usuarioId, 'x')).rejects.toThrow(/homologada/)
    await expect(registrar()).rejects.toThrow(/já foi gravado/)
  })
})
