/**
 * Dados mínimos de configuração (idempotente): empresa, unidade, áreas, calendário nacional,
 * sistemas críticos de TI, famílias padrão, catálogo de indicadores e metas iniciais,
 * e o primeiro administrador (ADMIN_EMAIL / ADMIN_SENHA).
 */
import { Client } from 'pg'
import bcrypt from 'bcryptjs'
import { INDICADORES, METAS_INICIAIS } from '../src/lib/indicadores/catalogo'

const FERIADOS_NACIONAIS: [string, string][] = [
  ['2025-01-01', 'Confraternização Universal'], ['2025-04-18', 'Paixão de Cristo'], ['2025-04-21', 'Tiradentes'],
  ['2025-05-01', 'Dia do Trabalho'], ['2025-09-07', 'Independência do Brasil'], ['2025-10-12', 'Nossa Senhora Aparecida'],
  ['2025-11-02', 'Finados'], ['2025-11-15', 'Proclamação da República'], ['2025-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['2025-12-25', 'Natal'],
  ['2026-01-01', 'Confraternização Universal'], ['2026-04-03', 'Paixão de Cristo'], ['2026-04-21', 'Tiradentes'],
  ['2026-05-01', 'Dia do Trabalho'], ['2026-09-07', 'Independência do Brasil'], ['2026-10-12', 'Nossa Senhora Aparecida'],
  ['2026-11-02', 'Finados'], ['2026-11-15', 'Proclamação da República'], ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['2026-12-25', 'Natal'],
  ['2027-01-01', 'Confraternização Universal'], ['2027-03-26', 'Paixão de Cristo'], ['2027-04-21', 'Tiradentes'],
  ['2027-05-01', 'Dia do Trabalho'], ['2027-09-07', 'Independência do Brasil'], ['2027-10-12', 'Nossa Senhora Aparecida'],
  ['2027-11-02', 'Finados'], ['2027-11-15', 'Proclamação da República'], ['2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['2027-12-25', 'Natal'],
]

export const FAMILIAS_EQUIPAMENTO: { nome: string; aliases: string[] }[] = [
  { nome: 'FORNO', aliases: ['FONRO'] },
  { nome: 'CLIMATIZADORA', aliases: ['CLIMATICA', 'CLIMA'] },
  { nome: 'FREEZER', aliases: [] },
  { nome: 'ARMARIO/ESQUELETO', aliases: ['ARMARIOS / ESQUELETO', 'ARMARIOS/ESQUELETO'] },
  { nome: 'MINI CAMARA', aliases: ['MINI CAMERA', 'MINI CAMARA SEM GRADES 1980'] },
  { nome: 'ESTUFA', aliases: [] },
  { nome: 'TELA/BANDEJA', aliases: ['TELA / BANDEJA', 'TELA  / BANDEJA'] },
]

const CONFIG: [string, unknown, string][] = [
  ['calendario.expediente', { fuso: 'America/Sao_Paulo', dias_uteis: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' },
    'Expediente oficial para horas úteis (PENDENTE de homologação: confirmar horário e sábado).'],
  ['migracao.data_corte', '2026-09-01', 'Competências anteriores usam o histórico migrado; a partir desta, os lançamentos do sistema.'],
  ['manut_externa.janela_reincidencia_dias', null, 'Janela de reincidência em dias (PENDENTE). Nulo: conta apenas vínculos explícitos.'],
  ['manut_externa.sla_primeira_resposta_horas_uteis', 48, 'Prazo da primeira resposta em horas úteis.'],
  ['semaforo.tolerancia_padrao_pct', 5, 'Tolerância do amarelo (%), relativa à meta e na direção do indicador.'],
  ['ti.backlog_dias_uteis', 7, 'Idade mínima (dias úteis) para contar no backlog envelhecido.'],
  ['ranking.volume_minimo', 3, 'Volume mínimo para exibir um item em ranking.'],
  ['privacidade.anonimizar_nomes_diretoria', false, 'Substitui nomes de solicitantes/técnicos por iniciais nas visões da Diretoria.'],
  ['fechamento.areas_obrigatorias', ['MANUT_INTERNA', 'MANUT_EXTERNA', 'ESTOQUE_PECAS', 'COMODATO', 'TI'], 'Áreas cujo fechamento aprovado é exigido para o selo "Oficial".'],
  ['ti.incluir_linear_nos_indicadores', false, 'Inclui chamados Linear/OPIVA (desenvolvimento) em SLA, MTTR, backlog, FCR e CSAT de TI (PENDENTE de decisão da Diretoria).'],
  ['integracao.base_instalada.status_ativos', ['01'], 'Status AA3 considerados ativos na base instalada (PENDENTE de homologação).'],
  ['relatorio.fonte_exportacao', 'OFICIAL', 'OFICIAL usa Plus Jakarta Sans/Nunito; SEGURA usa Arial/Calibri para máquinas sem as fontes.'],
]

export async function seed(databaseUrl = process.env.DATABASE_URL, log = console.log) {
  const c = new Client({ connectionString: databaseUrl })
  await c.connect()
  try {
    await c.query('begin')
    await c.query(`insert into empresa (nome) values ('Costa Lavos') on conflict (nome) do nothing`)
    await c.query(`insert into unidade (empresa_id, codigo, nome)
      select id, 'CAIEIRAS', 'Caieiras' from empresa where nome = 'Costa Lavos' on conflict (codigo) do nothing`)
    for (const [chave, valor, descricao] of CONFIG) {
      await c.query(`insert into configuracao (chave, valor, descricao) values ($1, $2::jsonb, $3) on conflict (chave) do nothing`,
        [chave, JSON.stringify(valor), descricao])
    }
    for (const [data, desc] of FERIADOS_NACIONAIS) {
      await c.query(`insert into calendario_feriado (data, descricao, abrangencia) values ($1, $2, 'NACIONAL')
        on conflict (data, coalesce(unidade_id,0)) do nothing`, [data, desc])
    }
    for (const nome of ['Protheus', 'APP', 'Integrações']) {
      await c.query(`insert into ti_sistema (nome, critico) values ($1, true) on conflict (nome) do nothing`, [nome])
    }
    let ordem = 0
    for (const f of FAMILIAS_EQUIPAMENTO) {
      const r = await c.query(`insert into familia_equipamento (nome, ordem) values ($1, $2)
        on conflict (upper(nome)) do update set ordem = excluded.ordem returning id`, [f.nome, ++ordem])
      for (const a of f.aliases) {
        await c.query(`insert into familia_equipamento_alias (alias, familia_id) values ($1, $2) on conflict (alias) do nothing`, [a, r.rows[0].id])
      }
    }
    await c.query(`insert into local_estoque (nome, unidade_id) select 'Estoque interno', id from unidade where codigo = 'CAIEIRAS'
      and not exists (select 1 from local_estoque where nome = 'Estoque interno')`)

    ordem = 0
    for (const d of INDICADORES) {
      ordem++
      await c.query(
        `insert into indicador_definicao (codigo, versao, nome, area_codigo, descricao, unidade_medida, formula, origem_dados,
           numerador, denominador, direcao, consolidacao, responsavel, fonte_regra, classe, ativo, vigencia_inicio, casas_decimais,
           calculador, pendencias, ordem)
         values ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'2026-01-01',$16,$17,$18,$19)
         on conflict (codigo, versao) do nothing`,
        [d.codigo, d.nome, d.area, d.descricao, d.unidade, d.formula, d.origem, d.numerador ?? null, d.denominador ?? null,
          d.direcao, d.consolidacao, d.responsavel ?? null, d.fonte, d.classe, d.classe !== 'CANDIDATO', d.casas, d.calculador,
          d.pendencias ?? null, ordem],
      )
    }
    const versoes = new Map<string, number>()
    for (const m of METAS_INICIAIS) {
      const k = `${m.indicador}|${m.ciclo}`
      const v = (versoes.get(k) ?? 0) + 1
      versoes.set(k, v)
      await c.query(
        `insert into meta (indicador_codigo, versao, ciclo, tipo, operador, valor, valor_max, vigencia_inicio, status, fonte_documento, motivo)
         values ($1,$2,$3,$4,$5,$6,$7,'2026-01-01',$8,$9,$10) on conflict (indicador_codigo, ciclo, versao) do nothing`,
        [m.indicador, v, m.ciclo, m.tipo, m.operador, m.valor, m.valorMax ?? null, m.status, m.fonte, m.motivo],
      )
    }

    const email = process.env.ADMIN_EMAIL
    const senha = process.env.ADMIN_SENHA
    if (email && senha) {
      const existe = await c.query('select id from usuario where lower(email) = lower($1)', [email])
      if (!existe.rowCount) {
        const h = await bcrypt.hash(senha, 12)
        const u = await c.query(`insert into usuario (nome, email, senha_hash, deve_trocar_senha) values ('Administrador', $1, $2, true) returning id`, [email, h])
        await c.query(`insert into usuario_papel (usuario_id, papel) values ($1, 'ADMIN')`, [u.rows[0].id])
        log(`Administrador criado: ${email} (troca de senha obrigatória no primeiro acesso).`)
      }
    } else {
      log('ADMIN_EMAIL/ADMIN_SENHA não informados: nenhum administrador criado.')
    }
    await c.query('commit')
    log('Seed concluído.')
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    await c.end()
  }
}

if (require.main === module) {
  seed().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
