/**
 * Gera em memória uma planilha SINTÉTICA com o mesmo layout da planilha
 * histórica real (6 abas, meses em colunas B..M, totais/médias por fórmula
 * com valor em cache). Todos os nomes, e-mails, IPs e ramais são fictícios.
 *
 * `divergencias: true` introduz erros conhecidos para os testes:
 *  - cache do TOTAL GERAL de janeiro (Estoque) e do TOTAL de julho (técnicos) errados;
 *  - resumo de manutenção em equipamento do cliente (agosto) diferente da lista;
 *  - chamado de TI duplicado (o quadro-resumo conta a linha repetida).
 */
import ExcelJS from 'exceljs'

type Linha = [string, (number | null)[]]
const MESES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 1)))
const col = (c: number) => {
  let s = ''
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}
const soma = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)
const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? soma(v) / v.length : undefined
}

interface OpcoesMatriz {
  rotuloCab: string
  mediaQuebrada?: boolean
  total?: { rotulo: string; meses: number[]; erro?: { mes: number; delta: number } }
  ignorarTotalAnual?: boolean
}

/** Escreve um bloco matricial e devolve a próxima linha livre. */
function matriz(ws: ExcelJS.Worksheet, r0: number, titulo: string, linhas: Linha[], o: OpcoesMatriz): number {
  ws.getCell(r0, 1).value = titulo
  ws.getCell(r0, 14).value = 'Formula não digitar'
  const rh = r0 + 1
  ws.getCell(rh, 1).value = o.rotuloCab
  MESES.forEach((d, i) => (ws.getCell(rh, 2 + i).value = d))
  ws.getCell(rh, 14).value = 'Total'
  ws.getCell(rh, 15).value = 'Média'
  let r = rh + 1
  for (const [rot, vals] of linhas) {
    ws.getCell(r, 1).value = rot
    vals.forEach((v, i) => {
      if (v !== null) ws.getCell(r, 2 + i).value = v
    })
    const faixa = `B${r}:M${r}`
    const mais = Array.from({ length: 12 }, (_, i) => `${col(2 + i)}${r}`).join('+')
    if (o.mediaQuebrada) {
      ws.getCell(r, 14).value = { formula: mais, result: soma(vals) }
      ws.getCell(r, 15).value = { formula: `AVERAGE(${mais})`, result: soma(vals) }
    } else {
      ws.getCell(r, 14).value = { formula: `SUM(${faixa})`, result: soma(vals) }
      const m = media(vals)
      ws.getCell(r, 15).value = m === undefined ? { formula: `AVERAGE(${faixa})`, result: { error: '#DIV/0!' } } : { formula: `AVERAGE(${faixa})`, result: m }
    }
    r++
  }
  if (o.total) {
    ws.getCell(r, 1).value = o.total.rotulo
    for (const i of o.total.meses) {
      const c = col(2 + i)
      let v = soma(linhas.map(([, vals]) => vals[i] ?? null))
      if (o.total.erro?.mes === i) v += o.total.erro.delta
      ws.getCell(r, 2 + i).value = { formula: `SUM(${c}${rh + 1}:${c}${r - 1})`, result: v }
    }
    r++
  }
  return r + 2
}

/** Linha-resumo com meses em A..L, total (M) e média (N). */
function resumoLinha(ws: ExcelJS.Worksheet, r0: number, cTitulo: number, titulo: string, vals: (number | null)[]): number {
  ws.getCell(r0, cTitulo).value = titulo
  MESES.forEach((d, i) => (ws.getCell(r0 + 1, 1 + i).value = d))
  ws.getCell(r0 + 1, 13).value = 'Total'
  ws.getCell(r0 + 1, 14).value = 'Média'
  vals.forEach((v, i) => {
    if (v !== null) ws.getCell(r0 + 2, 1 + i).value = v
  })
  ws.getCell(r0 + 2, 13).value = { formula: `SUM(A${r0 + 2}:L${r0 + 2})`, result: soma(vals) }
  ws.getCell(r0 + 2, 14).value = { formula: `AVERAGE(A${r0 + 2}:L${r0 + 2})`, result: media(vals) ?? 0 }
  return r0 + 5
}

/** Blocos mensais lado a lado: "Mês " + data, cabeçalhos e registros. */
function blocosMensais(ws: ExcelJS.Worksheet, r0: number, titulo: string, cabecalhos: string[], largura: number, porMes: (string | number)[][][]): number {
  let maxLinhas = 0
  MESES.forEach((d, i) => {
    const c = 1 + i * largura
    ws.getCell(r0, c).value = titulo
    ws.getCell(r0 + 1, c).value = 'Mês '
    ws.getCell(r0 + 1, c + 1).value = d
    cabecalhos.forEach((h, k) => (ws.getCell(r0 + 2, c + k).value = h))
    const regs = porMes[i] ?? []
    regs.forEach((reg, j) => reg.forEach((v, k) => (ws.getCell(r0 + 3 + j, c + k).value = v)))
    maxLinhas = Math.max(maxLinhas, regs.length)
  })
  return r0 + 3 + maxLinhas + 2
}

export interface OpcoesFixture {
  divergencias?: boolean
}

export async function gerarPlanilhaSintetica(op: OpcoesFixture = {}): Promise<Buffer> {
  const div = !!op.divergencias
  const wb = new ExcelJS.Workbook()

  /* ---------------- Equipe Interna ---------------- */
  const wi = wb.addWorksheet('Equipe Interna')
  wi.getCell('R2').value = 'Responsável Faz '
  matriz(wi, 3, 'Manutenção interna  por equipamento', [
    ['FREEZER', [27, 19, 48, 34, 31, 38, 22, 57]],
    ['ARMARIO/ESQUELETO', [34, 51, 36, 32, 88, 75, 50, 29]],
    ['FORNO', [12, 11, null, 11, 16, 19, 41, 19]],
    ['CLIMATIZADORA', [16, 9, 27, 20, 23, 22, 14, 16]],
    ['MINI CAMARA', [1, 0, 1, 2, 5, 6, 4, 2]],
  ], { rotuloCab: 'Equipamento inteno' })
  // Quadro lateral de economia estimada (não deve ser importado)
  wi.getCell('R3').value = 'Manutenção interna por equipamento Economia'
  wi.getCell('Q4').value = 'Equipamento'
  wi.getCell('R4').value = 'Valor Unitario'
  wi.getCell('S4').value = 'Valor Final'
  ;[['FREEZER', 3500, 276], ['FORNO', 7182.17, 129]].forEach(([n, v, q], k) => {
    wi.getCell(5 + k, 17).value = n
    wi.getCell(5 + k, 18).value = v
    wi.getCell(5 + k, 19).value = { formula: `R${5 + k}*N${5 + k}`, result: (v as number) * (q as number) }
  })
  wi.getCell('R10').value = 'TOTAL 1 º SEMESTRE 2026'
  wi.getCell('S10').value = { formula: 'SUM(S5:S9)', result: 3500 * 276 + 7182.17 * 129 }

  matriz(wi, 15, 'Equipamentos mais sucateados', [
    ['FORNO', [12, 4, 13, 4, 7, 7, 5, 2]],
    ['CLIMATICA', [5, 2, 1, 2, 1, 0, 6, 1]],
    ['FREEZER', [2, 0, 7, 2, 8, 2, 4, 1]],
    ['ARMARIO', [0, 0, 1, 0, 1, 0, 48, 0]],
    ['ESQUELETO', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['ESTUFA', [0, 0, 0, 0, 0, 0, 0, 0]],
  ], { rotuloCab: 'Equipamentos' })
  wi.getCell('R15').value = 'Equipamentos mais sucatiados Ano 2026'
  wi.getCell('R16').value = 'Valor Unitario'
  wi.getCell('S16').value = 'Valor Final'
  wi.getCell('Q17').value = 'FORNO'
  wi.getCell('R17').value = 3591.08
  wi.getCell('S17').value = { formula: 'R17*N17', result: 3591.08 * 54 }
  wi.getCell('R23').value = 'TOTAL  1º SEMESTRE 2026'
  wi.getCell('S23').value = { formula: 'SUM(S17:S22)', result: 3591.08 * 54 }

  matriz(wi, 25, 'Lavagens por equipamentos', [
    ['FREEZER', [52, 19, 111, 37, 35, 44, 27, 58]],
    ['FORNO', [18, 23, 28, 16, 19, 26, 14, 40]],
    ['MINI CAMERA', [1, 0, 3, 2, 5, 4, 2, 2]],
  ], { rotuloCab: 'Equipamento' })
  matriz(wi, 34, 'Peças  utilizadas internamente', [
    ['MANGUEIRAS', [35, 6, 23, 23, 31, 32, 26, 26]],
    ['BORRACHA', [15, 4, 20, 20, 24, 25, 23, 24]],
    ['BOTIJAS DE GÁS/CARGA DE GÁS', [1, 0, 10, 10, 3, 16, 19, 13]],
    ['CALDEIRAS', [0, 0, 0, 0, 0, 0, 0, 0]],
  ], { rotuloCab: 'Equipamento Familia' })

  /* ---------------- Equipe Externa ---------------- */
  const we = wb.addWorksheet('Equipe Externa')
  let r = matriz(we, 2, 'Tecnicos com mais atendimento externos', [
    ['TERCEIRO', [0, 0, 0, 0, 0, 0, 34, 74]],
    ['MATIAS', [2, 62, 63, 2, 19, 67, 55, 61]],
    ['APOIO', [72, 54, 64, 73, 42, 84, 37, 49]],
    ['ADRIANO', [58, 47, 52, 55, 46, 63, 53, 46]],
  ], { rotuloCab: 'Tecnico', total: { rotulo: 'TOTAL', meses: [5, 6, 7], erro: div ? { mes: 6, delta: 10 } : undefined } })
  r = matriz(we, r, 'Tecnicos com mais reincidentes', [
    ['MATIAS', [0, 6, 5, 0, 2, 4, 7, 2]],
    ['ADRIANO', [9, 8, 4, 3, 5, 1, 5, 2]],
  ], { rotuloCab: 'Tecnico' })
  r = matriz(we, r, 'Manutenção externo por equipamento', [
    ['FORNO', [169, 176, 189, 174, 170, 238, 216, 169]],
    ['CLIMATIZADORA', [125, 105, 90, 101, 106, 128, 146, 141]],
    ['ARMARIO', [4, 3, 2, 3, 5, 6, 5, 8]],
  ], { rotuloCab: 'Equipamento' })
  r = matriz(we, r, 'Manutenção externo por  rede', [
    ['ASSAI', [null, null, null, null, null, null, null, 29]],
    ['GPA', [null, null, null, null, null, null, null, 19]],
    ['DIA', [null, null, null, null, null, null, null, 0]],
    ['MRP', []],
  ], { rotuloCab: 'Rede', mediaQuebrada: true })

  const clientes: [string, number][][] = [
    [['CLIENTE ALFA ', 5], ['CLIENTE BETA', 4]],
    [['CLIENTE GAMA', 4], ['CLIENTE ALFA', 3], ['CLIENTE DELTA', 3]],
    [['CLIENTE BETA', 3]],
    [['CLIENTE EPSILON', 4]],
    [['CLIENTE ZETA', 3]],
    [['CLIENTE ETA', 3]],
    [['CLIENTE TETA', 3], ['CLIENTE IOTA', 3]],
    [['CLIENTE KAPA', 4]],
  ]
  const rCli = r
  r = blocosMensais(we, rCli, 'Clientes com Mais Chamados', ['Fantasia', 'Quantidade'], 3, clientes)
  r = resumoLinha(we, r + 2, 6, 'Clientes com mais Chamados Ano 2026', clientes.map((c) => c.length))

  const necessarios = [338, 281, 281, 283, 279, 371, 343, 313]
  const desnecessarios = [2, 1, 1, 1, 1, 1, 2, 1]
  r = matriz(we, r, 'Quantos chamados desnecessarios', [['Não', necessarios], ['SIM', desnecessarios]], { rotuloCab: 'Chamados Desnecessario' })
  const listaDesn = desnecessarios.map((n, i) => Array.from({ length: n }, (_, k) => [`LOJA FICTICIA ${i + 1}-${k + 1}`, `Solicitante Ficticio ${i}${k}`, 'EQUIPAMENTO NAO LIGA', 'DISJUNTOR DO CLIENTE DESLIGADO']))
  r = blocosMensais(we, r, 'Chamados Desnecessarios por cliente ', ['Fantasia', 'Solicitante', 'Motivo Solicitacao', 'Solucao dos Mecanicos internos'], 5, listaDesn)

  const equipCli = [1, 2, 0, 1, 0, 0, 1, 1]
  const listaEquip = equipCli.map((n, i) => Array.from({ length: n }, (_, k) => [`MERCADO FICTICIO ${i + 1}-${k + 1}`, `Pessoa Ficticia ${i}${k}`, 'FORNO', 'TROCA DO CONTROLADOR', 100 * (i + 1) + k]))
  r = blocosMensais(we, r, 'Manutenção em equipamento do cliente', ['Fantasia', 'Solicitante', 'Equipamento', 'Solução', 'Valor '], 6, listaEquip)
  r = resumoLinha(we, r + 2, 1, 'Manutenção em equipamento do cliente 1º Semestre', equipCli.map((n, i) => (div && i === 7 ? n + 1 : n)))

  // Trocas
  const rTroca = r + 2
  we.getCell(rTroca, 1).value = 'Trocas de equipamentos solicitadas pela equipe'
  ;['Fantasia', 'data da Solicitacao ', 'Data da troca', 'Soliocitado por', 'Equipamento ', 'Star ou Padrao '].forEach((h, k) => (we.getCell(rTroca + 2, 1 + k).value = h))
  const d = (m: number, dia: number) => new Date(Date.UTC(2026, m - 1, dia))
  const trocas: (string | Date)[][] = [
    ['LOJA TROCA 1', d(4, 2), d(4, 14), 'Pessoa Ficticia A', 'CLIMATIZADORA 20 TELAS ', 'PADRAO'],
    ['LOJA TROCA 2', d(4, 6), d(4, 15), 'COMODATO', 'FREEZER HORIZONTAL', 'PADRAO'],
    ['LOJA TROCA 3', d(5, 7), d(5, 8), 'Pessoa Ficticia B', 'ARMARIO', 'PADRAO'],
    ['LOJA TROCA 4', d(7, 1), d(7, 3), 'Pessoa Ficticia A', 'CLIMATIZADORA', 'STAR'],
    ['LOJA TROCA 5', d(7, 20), 'PENDENTE', 'Pessoa Ficticia C', 'FONRO', 'PADRAO'],
    ['LOJA TROCA 6', d(8, 28), d(9, 1), 'Pessoa Ficticia B', 'FORNO E FREEZER', 'PADRAO'],
  ]
  trocas.forEach((t, j) => t.forEach((v, k) => (we.getCell(rTroca + 3 + j, 1 + k).value = v)))
  r = rTroca + 3 + trocas.length + 3
  r = resumoLinha(we, r, 6, 'Trocas de equipamentos solicitadas pela equipe', [0, 0, 0, 2, 1, 0, 2, 1])
  matriz(we, r + 2, 'Pecas utilizadas Externamente', [
    ['RESISTENCIAS', [17, 13, 11, 11, 13, 20, 17, 23]],
    ['CONTROLADORES', [42, 20, 28, 22, 23, 30, 26, 19]],
    ['DISCOS', [0, 0, 0, 0, 0, 0, 0, 0]],
  ], { rotuloCab: 'Equipamento Familia' })

  /* ---------------- Estoque ---------------- */
  const wp = wb.addWorksheet('Estoque')
  r = matriz(wp, 2, 'Entrada de Estoque ', [
    ['FECHADURAS', [0, 1800, 0, null, null, 7120, 0, 8215]],
    ['CONTROLADORES', [0, 4615, 4100, 8533.38, 8356.04, null, 13200, 6132.28]],
  ], { rotuloCab: 'Equipamentos por familia', total: { rotulo: 'TOTAL GERAL', meses: [0, 1, 2, 3, 4, 5, 6, 7], erro: div ? { mes: 0, delta: 500 } : undefined } })
  r = matriz(wp, r, 'Saida de Estoque ', [
    ['CONTROLADORES', [8047.9, 10549.5, 7553.9, 17039.65, 15111.49, 16137.24, 8491, 15356.17]],
    ['VIDROS', [null, 0, 0, 0, 0, null, 0, null]],
  ], { rotuloCab: 'Equipamento por familia', total: { rotulo: 'TOTAL GERAL', meses: [0, 1, 2, 3, 4, 5, 6, 7] } })
  wp.getCell(r + 3, 1).value = 'ITENS RETIRADOS DE EQUIPAMENTOS '
  wp.getCell(r + 4, 1).value = 'MÊS'
  wp.getCell(r + 4, 2).value = 8
  wp.getCell(r + 6, 1).value = 'Rótulos de Linha'
  wp.getCell(r + 6, 2).value = 'Soma de VALOR TOTAL'

  /* ---------------- Entrega e retirada Comodato ---------------- */
  const wc = wb.addWorksheet('Entrega e retirada Comodato')
  const linhasCo: Linha[] = [
    ['ENTREGAS ', [55, 40, 49, 68, 57, 113, 87, 79]],
    ['TROCA ', [63, 45, 63, 68, 57, 70, 88, 50]],
    ['RETIRADAS', [20, 25, 18, 33, 41, 24, 38, 36]],
    ['SEM EXITO', [3, 4, 12, 8, 2, 1, 2, 0]],
    ['ENTREGAS/RETIRADAS FINAL DE ANO', [0, 5, 79, 0, 0, 0, 0, 0, 0, 0]],
  ]
  matriz(wc, 1, 'Entregas e Retiradas Comodato', linhasCo, { rotuloCab: 'Resumo', total: { rotulo: 'TOTAL', meses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } })

  /* ---------------- Estoque Comodato ---------------- */
  const wk = wb.addWorksheet('Estoque Comodato ')
  wk.getCell('A1').value = 'Responsável quem faz toda essa aba'
  const cab = ['PRODUTO ', 'Ant', 'Novos', 'Usados', 'Atual', 'Manutenção Int', 'Custo Usado', 'Custo Novo', 'Ent', 'Saidas Novo', 'Saida Usado']
  const meses: [string, (string | number)[][]][] = [
    ['Final mês Julho/26', [
      ['ARMARIOS / ESQUELETO', 112, 77, 17, 94, 514, 18462, 166460, 111, 71, 58],
      ['FORNO', 207, 155, 27, 182, 118, 101542.61, 1122580.76, 14, 22, 17],
      ['FREEZER ', 99, 56, 41, 97, 112, 76749.79, 206019.24, 62, 18, 46],
      ['MINI CAMARA SEM GRADES 1980', 16, 27, 7, 34, 0, 32550, 251100, 30, 6, 6],
    ]],
    ['Final mês Agosto/26', [
      ['ARMARIOS / ESQUELETO', 94, 63, 7, 70, 588, 6635.5, 114211, 75, 59, 40],
      ['FORNO', 182, 130, 32, 162, 116, 111395.7, 962489.21, 14, 26, 8],
      // Desbalanceado: 97 + 87 − 17 − 43 = 124, mas Novos + Usados = 125 (ajuste +1)
      ['FREEZER ', 97, 69, 56, 125, 86, 100418.99, 250502.43, 87, 17, 43],
      ['MINI CAMARA ', 34, 28, 1, 29, 4, 4650, 260400, 17, 12, 10],
    ]],
  ]
  r = 4
  for (const [titulo, prods] of meses) {
    for (let k = 2; k <= 7; k++) {
      wk.getCell(r, k).value = titulo
      wk.getCell(r + 1, k).value = titulo
    }
    cab.forEach((h, k) => (wk.getCell(r + 2, 1 + k).value = h))
    prods.forEach((p, j) => p.forEach((v, k) => (wk.getCell(r + 3 + j, 1 + k).value = v)))
    const rt = r + 3 + prods.length
    wk.getCell(rt, 7).value = Math.round(prods.reduce((s, p) => s + (p[6] as number), 0) * 100) / 100
    wk.getCell(rt, 8).value = Math.round(prods.reduce((s, p) => s + (p[7] as number), 0) * 100) / 100
    r = rt + 3
  }

  /* ---------------- T.I ---------------- */
  const wt = wb.addWorksheet('T.I')
  const cabTi = ['Número', 'Título', 'Status', 'Tipo', 'Prioridade', 'Origem', 'Nível Suporte', 'Categoria', 'Subcategoria', 'Equipe',
    'Técnico Responsável (Solucionado)', 'E-mail Técnico', 'Solicitante', 'E-mail Solicitante', 'Ramal', 'Setor', 'Unidade', 'SLA Prazo', 'SLA Violado',
    'SLA Violado Em', 'SLA Horas Pausadas', 'SLA Desvio (h)', 'Solução', 'Causa Raiz', 'Motivo Cancelamento', 'Fechado Em', 'Fechado Por',
    'Tempo de Resolução (h)', 'Escalado Em', 'Escalado Por', 'CSAT Nota', 'CSAT Comentário', 'CSAT Respondido Em', 'Tags', 'IP Abertura', 'Abertura',
    'Última Atualização', 'Data Abertura (só data)']
  cabTi.forEach((h, k) => (wt.getCell(16, 1 + k).value = h))
  interface T { n: string; t: string; s: string; ab: string; fe?: string; h?: string; sla?: string; desv?: string; tags?: string }
  const tickets: T[] = [
    { n: 'TI-2026080001', t: 'Impressora sem conexão', s: 'Encerrado / Resolvido', ab: '31/08/2026, 16:58:10', fe: '01/09/2026, 09:02:02', h: '16.1h', sla: 'Não', desv: '-4h', tags: 'rede, impressora' },
    { n: 'TI-2026080002', t: 'Acesso ao ERP', s: 'Encerrado / Resolvido', ab: '10/08/2026, 08:00:00', fe: '11/08/2026, 20:30:00', h: '36.5h', sla: 'Sim', desv: '+12.5h' },
    { n: 'TI-2026080003', t: 'testewvwcdwcww', s: 'Encerrado / Resolvido', ab: '12/08/2026, 10:00:00', fe: '12/08/2026, 10:30:00', h: '0.5h', sla: 'Não', desv: '-23.5h' },
    { n: 'TI-2026080004', t: 'Troca de monitor', s: 'Aberto', ab: '28/08/2026, 14:00:00', sla: 'Não' },
    { n: 'TI-2026080005', t: 'VPN intermitente', s: 'Aguardando Terceiros', ab: '20/08/2026, 09:15:00', sla: 'Sim' },
    { n: 'TI-2026080006', t: 'Pedido duplicado', s: 'Cancelado', ab: '05/08/2026, 11:00:00', fe: '05/08/2026, 12:00:00', h: '1h', sla: 'Não' },
    { n: 'SRL-2001', t: 'Relatório de vendas lento', s: 'Done', ab: '30/07/2026, 13:45:44', fe: '30/07/2026, 18:59:01' },
    { n: 'SRL-2002', t: 'Ajustar filtro do painel', s: 'Backlog', ab: '14/08/2026, 18:01:28' },
    { n: 'SRL-2003', t: 'Integração de estoque', s: 'In Progress', ab: '06/07/2026, 18:31:21' },
  ]
  const linhasTi = div ? [...tickets, tickets[0]] : tickets
  linhasTi.forEach((tk, j) => {
    const rr = 17 + j
    const ehTi = tk.n.startsWith('TI-')
    const v: Record<number, string | number> = {
      1: tk.n, 2: tk.t, 3: tk.s, 6: ehTi ? 'portal' : 'Linear', 11: ehTi ? 'Tecnico Ficticio' : 'usuario.ficticio', 36: tk.ab, 37: tk.fe ?? tk.ab, 38: tk.ab.slice(0, 10),
    }
    if (ehTi) {
      Object.assign(v, {
        4: 'Incidente', 5: 'Média', 7: 'N1', 8: 'Infraestrutura', 9: 'Rede', 12: 'tecnico.ficticio@exemplo.test', 13: 'Solicitante Ficticio',
        14: 'solicitante.ficticio@exemplo.test', 15: '(11) 0000-0000', 16: 'Comercial', 17: 'Matriz', 18: '01/09/2026, 13:00:00', 19: tk.sla ?? '', 21: 0, 35: `192.0.2.${j + 1}`,
      })
      if (tk.desv) v[22] = tk.desv
      if (tk.fe) {
        v[26] = tk.fe
        v[27] = 'tecnico.ficticio@exemplo.test'
      }
      if (tk.h) v[28] = tk.h
      if (tk.s === 'Cancelado') v[25] = 'Aberto em duplicidade'
    } else {
      v[5] = 'High'
      if (tk.fe) v[26] = tk.fe
    }
    if (tk.tags) v[34] = tk.tags
    for (const [k, val] of Object.entries(v)) wt.getCell(rr, Number(k)).value = val
  })
  const ti = linhasTi.filter((t) => t.n.startsWith('TI-'))
  const resolvidos = ti.filter((t) => t.s === 'Encerrado / Resolvido')
  const tempos = resolvidos.map((t) => Number(t.h!.replace('h', '')))
  const resumo: [string, number][] = [
    ['Chamados TI', ti.length],
    ['Chamados Linear (OPIVA)', linhasTi.length - ti.length],
    ['Total Exportado', linhasTi.length],
    ['Em Aberto (TI)', ti.filter((t) => !['Encerrado / Resolvido', 'Cancelado'].includes(t.s)).length],
    ['Encerrados / Resolvidos (TI)', resolvidos.length],
    ['Cancelados (TI)', ti.filter((t) => t.s === 'Cancelado').length],
    ['Chamados com atendimento Excedido (TI)', ti.filter((t) => t.sla === 'Sim').length],
    ['Tempo Médio Resolução (h)', Math.round((tempos.reduce((s, x) => s + x, 0) / tempos.length) * 10) / 10],
  ]
  wt.getCell('A2').value = 'Relatório de Chamados T.I     Mes de Agosto'
  wt.getCell('F2').value = 'Entregas de TI em APP'
  wt.getCell('F4').value = 'Aplicativo Ficticio'
  wt.getCell('G4').value = 'Disponível'
  resumo.forEach(([rot, val], k) => {
    const rr = k < 6 ? 4 + k : 11 + (k - 6)
    wt.getCell(rr, 1).value = rot
    wt.getCell(rr, 2).value = val
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}
