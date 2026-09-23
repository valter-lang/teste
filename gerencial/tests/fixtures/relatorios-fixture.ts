/**
 * Massa de dados dos testes/amostras da central de relatórios (maio–julho/2026).
 * Inclui propositalmente dados de contato (e-mails, telefones, solicitantes) que NUNCA podem
 * aparecer nas exportações. limpar() remove tudo o que foi criado.
 */
import { Pool, type PoolClient } from 'pg'

export const MESES_FIXTURE = ['2026-05-01', '2026-06-01', '2026-07-01']
export const COMPETENCIA_FIXTURE = '2026-07-01'
export const EMAIL_PROIBIDO = 'maria.contato@clientebella.com.br'

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

export interface Fixture {
  adminId: string
  limpar: () => Promise<void>
  definirFechamento: (status: 'RASCUNHO' | 'APROVADO', areas?: string[]) => Promise<void>
}

async function um<T = Record<string, unknown>>(c: PoolClient, sql: string, p: unknown[] = []): Promise<T> {
  return (await c.query(sql, p)).rows[0] as T
}

export async function criarFixture(pool: Pool): Promise<Fixture> {
  const c = await pool.connect()
  const ids: Record<string, (number | string)[]> = {}
  const guardar = (t: string, id: number | string) => { (ids[t] ??= []).push(id) }
  try {
    await c.query('begin')
    const admin = await um<{ id: string }>(c, `select id from usuario where lower(email) = 'admin@costalavos.local'`)
    await c.query(`select set_config('app.usuario_id', $1, true)`, [admin.id])
    const fam = (await c.query<{ id: number; nome: string }>(`select id, nome from familia_equipamento order by id`)).rows
    const rede = await um<{ id: number }>(c, `insert into rede (nome) values ('FX Rede Pão Dourado') returning id`)
    guardar('rede', rede.id)
    const clientes: number[] = []
    for (const [i, nome] of ['Padaria Bella Vista', 'Panificadora Central', 'Supermercado Boa Compra', 'Padaria Estrela', 'Confeitaria Aurora', 'Padaria Trigo Nobre'].entries()) {
      const r = await um<{ id: number }>(c, `insert into cliente (fantasia, razao_social, rede_id, unidade_id, cidade, uf) values ($1, $2, $3, 1, 'São Paulo', 'SP') returning id`,
        [`${nome} FX`, `${nome} Ltda`, i % 2 ? rede.id : null])
      clientes.push(r.id); guardar('cliente', r.id)
    }
    const tecnicos: number[] = []
    for (const [nome, tipo] of [['Epifanio Souza FX', 'EXTERNO'], ['Wanderson Lima FX', 'EXTERNO'], ['Matias Rocha FX', 'EXTERNO'], ['Adriano Pereira FX', 'INTERNO'], ['Mateus Alves FX', 'INTERNO']] as const) {
      const r = await um<{ id: number }>(c, `insert into tecnico (nome, tipo) values ($1, $2) returning id`, [nome, tipo])
      tecnicos.push(r.id); guardar('tecnico', r.id)
    }
    const famPeca: number[] = []
    for (const [nome, abc] of [['FX Resistências', 'A'], ['FX Motores', 'A'], ['FX Termostatos', 'B'], ['FX Borrachas', 'C']] as const) {
      const r = await um<{ id: number }>(c, `insert into familia_peca (nome, classe_abc) values ($1, $2) returning id`, [nome, abc])
      famPeca.push(r.id); guardar('familia_peca', r.id)
    }
    const imp = await um<{ id: number }>(c, `insert into importacao (arquivo_nome, arquivo_sha256, status, criado_por) values ('fixture-relatorios.xlsx', 'fx', 'GRAVADA', $1) returning id`, [admin.id])
    guardar('importacao', imp.id)

    for (const [k, comp] of MESES_FIXTURE.entries()) {
      const r = rng(1000 + k)
      const ym = comp.slice(0, 7)
      const dia = (d: number) => `${ym}-${String(d).padStart(2, '0')}`
      // Manutenção interna
      const nRec = [34, 38, 29][k]
      for (let i = 0; i < nRec + 6 + 8; i++) {
        const f = fam[Math.floor(r() * 5)].id
        const tipo = i < nRec ? ['RECUPERACAO', 'RECUPERADO'] : i < nRec + 6 ? ['RECUPERACAO', 'SUCATEADO'] : ['HIGIENIZACAO', 'HIGIENIZADO']
        const x = await um<{ id: number }>(c, `insert into manut_interna (competencia, unidade_id, data_recebimento, data_conclusao, familia_id, tipo_servico, resultado, tecnico_id, motivo_sucateamento, custo_mao_obra, observacao, criado_por)
          values ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [comp, dia(2 + (i % 20)), dia(4 + (i % 20)), f, tipo[0], tipo[1], tecnicos[3 + (i % 2)], tipo[1] === 'SUCATEADO' ? 'Corrosão estrutural' : null,
            80 + Math.round(r() * 120), i === 0 ? `Ligar para (11) 98765-4321 ou ${EMAIL_PROIBIDO}` : null, admin.id])
        guardar('manut_interna', x.id)
      }
      // Base ativa e consumo
      const b = await um<{ id: number }>(c, `insert into comodato_base_ativa (competencia, equipamentos_ativos, clientes_ativos, criado_por) values ($1, $2, 410, $3) returning id`, [comp, 1180 + k * 7, admin.id])
      guardar('comodato_base_ativa', b.id)
      for (const [j, cl] of clientes.entries()) {
        const x = await um<{ id: number }>(c, `insert into comodato_consumo (competencia, cliente_id, kg_comprados, consumo_minimo_kg, criado_por) values ($1, $2, $3, 300, $4) returning id`,
          [comp, cl, j === 2 ? 180 + k * 10 : 420 + j * 35 + k * 12, admin.id])
        guardar('comodato_consumo', x.id)
      }
      // Chamados externos
      const chamados: number[] = []
      const nCh = [26, 31, 28][k]
      for (let i = 0; i < nCh; i++) {
        const aberto = `${dia(1 + (i % 26))} ${String(8 + (i % 8)).padStart(2, '0')}:15:00-03`
        const resp = `${dia(1 + (i % 26))} ${String(9 + (i % 8)).padStart(2, '0')}:40:00-03`
        const enc = `${dia(Math.min(28, 2 + (i % 26)))} 16:30:00-03`
        const desnec = i % 9 === 4
        const anterior = i > 5 && i % 11 === 0 ? chamados[i - 5] : null
        const x = await um<{ id: number }>(c, `insert into chamado_externo (numero, competencia, aberto_em, primeira_resposta_em, atendido_em, encerrado_em, cliente_id, unidade_id, solicitante,
            familia_id, tecnico_id, causa, solucao, status, necessario, motivo_desnecessario, justificativa_desnecessario, chamado_anterior_id, criado_por)
          values ($1,$2,$3,$4,$4,$5,$6,1,$7,$8,$9,$10,$11,'ENCERRADO',$12,$13,$14,$15,$16) returning id`,
          [`FX-${ym}-${i}`, comp, aberto, resp, enc, clientes[i % clientes.length], `Maria Contato ${EMAIL_PROIBIDO}`, fam[i % 4].id, tecnicos[i % 3],
            'Falha no termostato', i === 1 ? `Cliente pediu retorno em ${EMAIL_PROIBIDO}` : 'Troca de componente', !desnec,
            desnec ? (i % 2 ? 'SEM_DEFEITO' : 'ELETRICA_CLIENTE') : null, desnec ? 'Equipamento sem defeito constatado' : null, anterior, admin.id])
        chamados.push(x.id); guardar('chamado_externo', x.id)
      }
      // Trocas pela manutenção
      for (let i = 0; i < 3 + k; i++) {
        const x = await um<{ id: number }>(c, `insert into solicitacao_troca (competencia, cliente_id, data_solicitacao, data_troca, solicitado_por_tecnico_id, solicitado_por_texto, familia_id, status, criado_por)
          values ($1,$2,$3,$4,$5,'Gerente Fulano (11) 3333-4444',$6,'CONCLUIDA',$7) returning id`, [comp, clientes[i % 6], dia(5 + i), dia(8 + i), tecnicos[i % 3], fam[i % 3].id, admin.id])
        guardar('solicitacao_troca', x.id)
      }
      // Estoque de peças (entradas/saídas por evento; julho também tem histórico migrado da saída em R$)
      for (let i = 0; i < 8; i++) {
        const tipo = i < 3 ? 'ENTRADA' : 'SAIDA'
        const x = await um<{ id: number }>(c, `insert into movimento_estoque (competencia, data, local_estoque_id, familia_id, tipo, quantidade, valor_total, aplicacao, motivo, criado_por)
          values ($1,$2,(select min(id) from local_estoque),$3,$4,$5,$6,$7,'Reposição',$8) returning id`,
          [comp, dia(3 + i), famPeca[i % 4], tipo, 2 + (i % 5), 150 + i * 42.5 + k * 30, tipo === 'SAIDA' ? (i % 2 ? 'INTERNA' : 'EXTERNA') : null, admin.id])
        guardar('movimento_estoque', x.id)
      }
      // Comodato: entregas, retiradas e trocas
      const mov: [string, number][] = [['ENTREGA', [14, 17, 12][k]], ['RETIRADA', [9, 8, 10][k]], ['TROCA', [5, 7, 6][k]]]
      for (const [tipo, n] of mov) {
        for (let i = 0; i < n; i++) {
          const x = await um<{ id: number }>(c, `insert into comodato_movimento (competencia, solicitacao_numero, cliente_id, familia_id, tipo, data_solicitacao, data_conclusao, situacao, responsavel, criado_por)
            values ($1,$2,$3,$4,$5,$6,$7,'CONCLUIDO','Motorista Zé (11) 91234-5678',$8) returning id`,
            [comp, `FX-${ym}-${tipo}-${i}`, clientes[i % 6], fam[(i + (tipo === 'TROCA' ? 2 : 0)) % 5].id, tipo, dia(2 + i), dia(4 + i), admin.id])
          guardar('comodato_movimento', x.id)
        }
      }
      // Chamados de TI (com dados de contato que NÃO podem sair)
      const nTi = [22, 27, 25][k]
      for (let i = 0; i < nTi; i++) {
        const resolvido = i % 6 !== 5
        const x = await um<{ id: number }>(c, `insert into chamado_ti (numero, sistema_origem, competencia, titulo, status, status_normalizado, tipo, prioridade, categoria, tecnico_responsavel,
            solicitante, departamento, aberto_em, sla_prazo, sla_violado, fechado_em, tempo_resolucao_origem_h, csat_nota, csat_comentario, resolvido_primeiro_contato, criado_por)
          values ($1,'TI',$2,$3,$4,$5,'Incidente',$6,$7,'Carlos Técnico','Joana Solicitante','Comercial',$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
          [`FX-TI-${ym}-${i}`, comp, i === 0 ? `Sem acesso ao e-mail joana@costalavos.com.br` : `Chamado ${i}`, resolvido ? 'Resolvido' : 'Em atendimento',
            resolvido ? 'RESOLVIDO' : 'EM_ATENDIMENTO', ['Alta', 'Média', 'Baixa'][i % 3], ['Acesso', 'Hardware', 'Protheus', 'Rede'][i % 4],
            `${dia(1 + (i % 25))} 09:00:00-03`, `${dia(1 + (i % 25))} 17:00:00-03`, i % 7 === 3, resolvido ? `${dia(1 + (i % 25))} 15:00:00-03` : null,
            resolvido ? 6 : null, resolvido ? 4 + (i % 2) : null, 'Atendimento ótimo, falar com joana@costalavos.com.br', i % 3 === 0, admin.id])
        guardar('chamado_ti', x.id)
        await c.query(`insert into chamado_ti_restrito (chamado_id, email_solicitante, ramal, ip_abertura) values ($1, 'joana@costalavos.com.br', '4321', '10.0.0.12')`, [x.id])
      }
      // Posição do estoque de comodato
      if (comp === '2026-07-01') {
        for (const [prod, ant, ent, sn, su] of [['FORNO TURBO 10', 40, 12, 6, 3], ['CLIMATIZADORA 20', 25, 8, 4, 2]] as const) {
          const x = await um<{ id: number }>(c, `insert into comodato_posicao (competencia, produto, unidade_id, posicao_anterior, entradas, saidas_novos, saidas_usados, novos, usados, manutencao_interna, sucata, criado_por)
            values ($1,$2,1,$3,$4,$5,$6,$7,$8,3,1,$9) returning id`, [comp, prod, ant, ent, sn, su, Math.ceil((ant + ent - sn - su) / 2), Math.floor((ant + ent - sn - su) / 2), admin.id])
          guardar('comodato_posicao', x.id)
        }
      }
    }
    // Histórico migrado (julho < data de corte): saídas de estoque em R$ por família de peça
    for (const [i, v] of [['FX Resistências', 5230.4], ['FX Motores', 3120], ['FX Termostatos', 980.55]].entries()) {
      const x = await um<{ id: number }>(c, `insert into historico_agregado (importacao_id, area_codigo, serie, dimensao_tipo, dimensao_valor, competencia, valor, aba, celula)
        values ($1, 'ESTOQUE_PECAS', 'EP_SAIDA_RS', 'FAMILIA_PECA', $2, '2026-07-01', $3, 'Estoque', $4) returning id`, [imp.id, v[0], v[1], `C${10 + i}`])
      guardar('historico_agregado', x.id)
    }
    // Análises e planos de julho
    const analises: [string, string, string, string | null, string | null, string | null][] = [
      ['MANUT_INTERNA', 'DESTAQUE', 'Oficina recuperou menos equipamentos por férias de um técnico', '29 recuperados', 'MI_RECUPERACOES', null],
      ['MANUT_EXTERNA', 'ATENCAO', 'Reincidência concentrada em fornos de uma rede', '3 retornos', 'ME_REINCIDENCIA', null],
      ['MANUT_EXTERNA', 'EXPLICACAO_DESVIO', `SLA impactado por chamados abertos após o expediente (contato ${EMAIL_PROIBIDO})`, null, 'ME_SLA_PRIMEIRA_RESPOSTA', null],
      ['TI', 'RISCO', 'Servidor de arquivos sem redundância até a migração', null, null, null],
      ['COMODATO', 'DEPENDENCIA', 'Entregas dependem da liberação de fornos pela manutenção interna', null, null, 'MANUT_INTERNA'],
      ['COMODATO', 'DECISAO_SOLICITADA', 'Aprovar a compra de 20 fornos para reposição do parque', 'R$ 180 mil', null, null],
    ]
    for (const [area, tipo, fato, numero, ind, dep] of analises) {
      const x = await um<{ id: number }>(c, `insert into analise_item (competencia, area_codigo, tipo, fato, numero, indicador_codigo, ocorrencia, responsavel, area_dependente, criado_por)
        values ('2026-07-01', $1, $2, $3, $4, $5, $6, 'Gestor da área', $7, $8) returning id`, [area, tipo, fato, numero, ind, tipo === 'ATENCAO' && !ind ? 'Ocorrência' : null, dep, admin.id])
      guardar('analise_item', x.id)
    }
    for (const [area, ind, acao, prazo, status] of [
      ['MANUT_EXTERNA', 'ME_REINCIDENCIA', 'Revisar procedimento de teste final dos fornos', '2026-07-15', 'ABERTA'],
      ['MANUT_EXTERNA', 'ME_SLA_PRIMEIRA_RESPOSTA', 'Criar plantão de primeira resposta no fim do dia', '2026-09-30', 'EM_ANDAMENTO'],
    ] as const) {
      const x = await um<{ id: number }>(c, `insert into plano_acao (area_codigo, indicador_codigo, competencia_origem, causa_raiz, acao, entregavel, responsavel_nome, inicio, prazo, status, criticidade, resultado_esperado, criado_por)
        values ($1,$2,'2026-07-01','Processo sem padrão',$3,'Procedimento publicado','Coordenador de Campo','2026-07-05',$4,$5,'ALTA','Indicador na meta',$6) returning id`, [area, ind, acao, prazo, status, admin.id])
      guardar('plano_acao', x.id)
    }
    await c.query('commit')
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }

  const adminId = (await pool.query<{ id: string }>(`select id from usuario where lower(email) = 'admin@costalavos.local'`)).rows[0].id

  return {
    adminId,
    async definirFechamento(status, areas = ['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI']) {
      await pool.query(`delete from periodo_area where competencia = $1`, [COMPETENCIA_FIXTURE])
      for (const a of areas) await pool.query(`insert into periodo_area (competencia, area_codigo, status, versao) values ($1, $2, $3, 1)`, [COMPETENCIA_FIXTURE, a, status])
    },
    async limpar() {
      const cl = await pool.connect()
      try {
        await cl.query('begin')
        await cl.query(`select set_config('app.ignorar_bloqueio', 'on', true)`)
        await cl.query(`delete from periodo_area where competencia = any($1)`, [MESES_FIXTURE])
        const ordem = ['plano_acao', 'analise_item', 'historico_agregado', 'comodato_posicao', 'chamado_ti', 'comodato_movimento', 'movimento_estoque',
          'solicitacao_troca', 'chamado_externo', 'comodato_consumo', 'comodato_base_ativa', 'manut_interna', 'importacao', 'familia_peca', 'tecnico', 'cliente', 'rede']
        for (const t of ordem) {
          if (!ids[t]?.length) continue
          if (t === 'chamado_externo') await cl.query(`update chamado_externo set chamado_anterior_id = null where id = any($1)`, [ids[t]])
          await cl.query(`delete from ${t} where id = any($1)`, [ids[t]])
        }
        await cl.query(`delete from indicador_resultado where periodo_inicio >= '2025-01-01'`)
        await cl.query('commit')
      } catch (e) {
        await cl.query('rollback')
        throw e
      } finally {
        cl.release()
      }
    },
  }
}
