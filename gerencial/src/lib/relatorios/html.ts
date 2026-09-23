/**
 * Modelos HTML (servidor, sem React) para os PDFs:
 *  - htmlApresentacao: 16:9 (1280×720 px por página), desenha as mesmas primitivas do PowerPoint;
 *  - htmlRelatorioA4: relatório executivo A4 retrato com capa, sumário e seções.
 * Todo texto dinâmico passa por esc().
 */
import { COR, STATUS_REL, URL_FONTES_GOOGLE, cor, fontes, type Fontes } from './estilo'
import { montarDeck, type Deck } from './estrutura'
import { diagramar, formatar, formatoDe, type El } from './layout'
import { svgColunas, svgPareto } from './graficos'
import { esc, SECOES } from './nomes'
import { numero } from '@/lib/format'
import type { DadosRelatorio, IndicadorRelatorio, Quebra, TabelaExtra } from './tipos'

const PX = 96
const px = (v: number) => `${(v * PX).toFixed(2)}px`

function cabecalhoHtml(f: Fontes, oficial: boolean, css: string, titulo: string, cssFontes?: string | null): string {
  const fontesOficiais = !oficial ? '' : cssFontes ? `<style>${cssFontes}</style>` : `<link rel="stylesheet" href="${URL_FONTES_GOOGLE}">`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
${fontesOficiais}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:${f.pilhaCorpo};color:${cor(COR.escuro)}}
.ft{font-family:${f.pilhaTitulo}}
.fc{font-family:${f.pilhaCapa}}
${css}
</style></head><body>`
}

/* ================================================================== 16:9 */

function elHtml(el: El, f: Fontes): string {
  const pos = `left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};`
  switch (el.k) {
    case 'ret':
      return `<div class="el" style="${pos}height:${px(el.h)};${el.fill ? `background:${cor(el.fill)};` : ''}${el.linha ? `border:1px solid ${cor(el.linha)};` : ''}${el.raio ? `border-radius:${px(el.raio)};` : ''}"></div>`
    case 'txt': {
      const fam = el.fonte === 'titulo' ? f.pilhaTitulo : el.fonte === 'capa' ? f.pilhaCapa : f.pilhaCorpo
      const just = el.valign === 'm' ? 'center' : el.valign === 'b' ? 'flex-end' : 'flex-start'
      const runs = el.runs.map((r) => {
        const st = `${r.negrito !== undefined ? `font-weight:${r.negrito ? 700 : 400};` : ''}${r.cor ? `color:${cor(r.cor)};` : ''}${r.tam ? `font-size:${r.tam}pt;` : ''}${r.italico ? 'font-style:italic;' : ''}`
        const span = `<span style="${st}">${esc(r.texto)}</span>${r.quebra ? '<br>' : ''}`
        return r.link ? `<a href="#slide-${r.link}">${span}</a>` : span
      }).join('')
      const conteudo = el.link ? `<a href="#slide-${el.link}">${runs}</a>` : runs
      return `<div class="el tx" style="${pos}height:${px(el.h)};font-family:${fam};font-size:${el.tam}pt;color:${cor(el.cor)};font-weight:${el.negrito ? 700 : 400};${el.italico ? 'font-style:italic;' : ''}justify-content:${just};text-align:${el.alinhar === 'c' ? 'center' : el.alinhar === 'r' ? 'right' : 'left'};${el.fill ? `background:${cor(el.fill)};padding:0 4pt;` : ''}${el.raio && el.fill ? `border-radius:${px(el.raio)};` : ''}"><div>${conteudo}</div></div>`
    }
    case 'tab': {
      const al = (a: string) => (a === 'direita' ? 'right' : a === 'centro' ? 'center' : 'left')
      const col = el.colW.map((w) => `<col style="width:${px(w)}">`).join('')
      const cab = el.cab.map((c, i) => `<th style="text-align:${al(el.alinhamento[i])}">${esc(c)}</th>`).join('')
      const linhas = el.linhas.map((l, r) => `<tr style="height:${px(el.alturaLinha)};background:${r % 2 ? '#FAF7F4' : '#FFFFFF'}">${l.map((c, i) =>
        `<td style="text-align:${al(el.alinhamento[i])};${c.cor ? `color:${cor(c.cor)};` : ''}${c.negrito ? 'font-weight:700;' : ''}${c.fill ? `background:${cor(c.fill)};` : ''}">${esc(c.texto)}</td>`).join('')}</tr>`).join('')
      const larguraTab = `left:${px(el.x)};top:${px(el.y)};width:${px(el.colW.reduce((a, b) => a + b, 0))};`
      return `<table class="el tb" style="${larguraTab}font-size:${el.tam}pt"><colgroup>${col}</colgroup><thead><tr style="height:${px(el.alturaLinha)}">${cab}</tr></thead><tbody>${linhas}</tbody></table>`
    }
    case 'graf': {
      const w = el.w * PX
      const h = el.h * PX
      const g = el.g
      let svg: string
      if (g.t === 'colunas') {
        const fmt = (v: number) => formatar(g.formato, v)
        const unica = g.destacarUltimo && g.series.length === 1
        svg = svgColunas({
          categorias: g.categorias, series: g.series, largura: w, altura: h, formatar: fmt, fonte: f.pilhaCorpo, tamanhoTexto: 12,
          coresPorPonto: unica ? g.categorias.map((_, i) => (i === g.categorias.length - 1 ? COR.vermelho : COR.pedra)) : undefined,
          meta: g.meta, legenda: g.legenda,
        })
      } else {
        svg = svgPareto({ itens: g.categorias.map((c, i) => ({ rotulo: c, valor: g.valores[i], acumulado: g.acumulado[i], classeA: g.classeA[i] })), largura: w, altura: h, formatar: (v) => formatar(g.formato, v), fonte: f.pilhaCorpo, tamanhoTexto: 12 })
      }
      return `<div class="el" style="${pos}height:${px(el.h)}">${svg}</div>`
    }
    case 'img':
      return `<img class="el" alt="Costa Lavos" src="data:${esc(el.mime)};base64,${el.base64}" style="${pos}height:${px(el.h)};object-fit:contain;object-position:left center">`
  }
}

export function htmlApresentacao(d: DadosRelatorio, cssFontes?: string | null, deck: Deck = montarDeck(d)): string {
  const f = fontes(d.metadados.fonteExportacao)
  const css = `
@page{size:1280px 720px;margin:0}
.slide{position:relative;width:1280px;height:720px;overflow:hidden;page-break-after:always;break-after:page}
.slide:last-child{page-break-after:auto;break-after:auto}
.el{position:absolute}
.tx{display:flex;flex-direction:column;overflow:hidden;line-height:1.18;white-space:pre-wrap;word-break:break-word}
.tx a{color:inherit;text-decoration:none}
.tb{border-collapse:collapse;table-layout:fixed}
.tb th{background:${cor(COR.vinho)};color:#fff;font-family:${f.pilhaTitulo};font-weight:700;padding:0 7px;border:0.5pt solid #E4E0DC}
.tb td{padding:0 7px;border:0.5pt solid #E4E0DC;color:${cor(COR.tinta)};line-height:1.15;overflow:hidden}
`
  const slides = diagramar(d, deck).map((s, i) => `<section class="slide" id="slide-${i + 1}" style="background:${cor(s.fundo)}" aria-label="${esc(s.titulo)}">${s.els.map((e) => elHtml(e, f)).join('')}</section>`)
  return `${cabecalhoHtml(f, d.metadados.fonteExportacao === 'OFICIAL', css, `Apresentação da Diretoria — ${d.metadados.competenciaRotulo}`, cssFontes)}${slides.join('\n')}</body></html>`
}

/* ================================================================== A4 */

export interface SecaoA4 { id: string; titulo: string; html: string }

const pill = (status: IndicadorRelatorio['mes']['status']) => {
  const s = STATUS_REL[status]
  return `<span class="pill" style="color:${cor(s.cor)};background:${cor(s.fundo)}">${esc(s.simbolo)}&nbsp;${esc(s.texto)}</span>`
}

function tabelaIndicadores(inds: IndicadorRelatorio[]): string {
  const linhas = inds.map((i) => `<tr>
    <td><b>${esc(i.nome)}</b><div class="sub">${esc(i.codigo)} • ${esc(i.classe.toLowerCase())}</div></td>
    <td class="n"><b>${esc(i.mes.texto)}</b></td><td class="n">${esc(i.mes.metaTexto)}</td><td>${pill(i.mes.status)}</td>
    <td class="n">${esc(i.mes.anteriorTexto)}<div class="sub">${esc(i.mes.variacaoTexto)}</div></td>
    <td class="n">${esc(i.trimestre.texto)}</td><td class="n">${esc(i.semestre.texto)}</td><td class="n">${esc(i.ano.texto)}</td>
    <td>${esc(i.tendenciaTexto)}</td></tr>`).join('')
  return `<table class="t"><thead><tr><th>Indicador</th><th class="n">Realizado</th><th class="n">Meta</th><th>Status</th><th class="n">Mês anterior</th><th class="n">Trimestre</th><th class="n">Semestre</th><th class="n">Ano</th><th>Tendência</th></tr></thead><tbody>${linhas}</tbody></table>`
}

function cartaoIndicadorA4(i: IndicadorRelatorio, f: Fontes): string {
  const fmt = formatoDe(i.unidade, i.casas)
  const svg = svgColunas({
    categorias: i.evolucao.map((p) => p.rotulo), series: [{ nome: i.nome, valores: i.evolucao.map((p) => p.valor), cor: COR.pedra }],
    coresPorPonto: i.evolucao.map((_, k) => (k === i.evolucao.length - 1 ? COR.vermelho : COR.pedra)),
    meta: i.mes.alvo !== null ? { valor: i.mes.alvo, rotulo: `Meta ${i.mes.metaTexto}` } : null,
    largura: 330, altura: 150, formatar: (v) => formatar(fmt, v), fonte: f.pilhaCorpo, tamanhoTexto: 9,
  })
  const coment = i.comentarios.length ? `<ul class="com">${i.comentarios.map((c) => `<li><b>${esc(c.tipo)}:</b> ${esc(c.texto)}</li>`).join('')}</ul>` : ''
  return `<div class="card ind">
    <div class="sub up">${esc(i.areaNome)} • ${esc(i.classe.toLowerCase())}</div>
    <h4 class="ft">${esc(i.nome)}</h4>
    <div class="linha"><span class="valor ft" style="color:${cor(i.mes.status === 'VERMELHO' ? COR.vermelho : COR.vinho)}">${esc(i.mes.texto)}</span>${pill(i.mes.status)}</div>
    <div class="kv"><span>Meta</span>${esc(i.mes.metaTexto)}</div>
    <div class="kv"><span>Mês anterior</span>${esc(i.mes.anteriorTexto)} (${esc(i.mes.variacaoTexto)})</div>
    <div class="kv"><span>Acumulado ano</span>${esc(i.ano.texto)} • ${esc(i.tendenciaTexto)}</div>
    ${i.mes.motivo ? `<div class="kv"><span>Situação do dado</span>${esc(i.mes.motivo)}</div>` : ''}
    <div class="graf">${svg}</div>${coment}</div>`
}

function quebraA4(q: Quebra, f: Fontes): string {
  const fmtF = q.unidade === 'R$' ? { casas: 0, sufixo: '' as const, moeda: true } : { casas: 0, sufixo: '' as const, moeda: false }
  const fmt = (v: number) => formatar(fmtF, v)
  const itens = q.itens.slice(0, 8)
  const svg = q.tipo === 'PARETO'
    ? svgPareto({ itens: itens.map((i) => ({ rotulo: i.dimensao, valor: i.atual, acumulado: i.acumulado, classeA: i.classeA })), largura: 680, altura: 210, formatar: fmt, fonte: f.pilhaCorpo, tamanhoTexto: 9 })
    : svgColunas({ categorias: itens.map((i) => i.dimensao), series: q.rotulosMeses.map((r, k) => ({ nome: r, valores: itens.map((i) => i.valores[k]), cor: ['E4E0DC', COR.pedra, COR.vermelho][k] })), largura: 680, altura: 210, formatar: fmt, fonte: f.pilhaCorpo, tamanhoTexto: 9, legenda: true })
  const linhas = itens.map((i) => `<tr><td>${esc(i.dimensao)}</td>${i.valores.map((v) => `<td class="n">${esc(q.unidade === 'R$' ? formatar(fmtF, v) : numero(v, 0))}</td>`).join('')}<td class="n">${esc(numero(i.participacao, 1))}%</td><td class="n">${esc(numero(i.acumulado, 1))}%</td></tr>`).join('')
  return `<div class="card avoid">
    <h4 class="ft">${esc(q.titulo)}</h4>
    <div class="sub">Totais: ${q.rotulosMeses.map((r, k) => `${esc(r)} ${esc(q.totaisTexto[k])}`).join(' • ')} — fonte: ${esc(q.fonte)}</div>
    <div class="graf">${svg}</div>
    <table class="t"><thead><tr><th>${esc(q.dimensaoRotulo)}</th>${q.rotulosMeses.map((r) => `<th class="n">${esc(r)}</th>`).join('')}<th class="n">Particip.</th><th class="n">Acumulado</th></tr></thead><tbody>${linhas}</tbody></table>
  </div>`
}

function tabelaExtraA4(t: TabelaExtra): string {
  return `<div class="card avoid"><h4 class="ft">${esc(t.titulo)}</h4><div class="sub">Fonte: ${esc(t.fonte)}</div>
    <table class="t"><thead><tr>${t.colunas.map((c, i) => `<th class="${t.alinhamento[i] === 'direita' ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${t.alinhamento[i] === 'direita' ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

export function secoesA4(d: DadosRelatorio): SecaoA4[] {
  const f = fontes(d.metadados.fonteExportacao)
  const m = d.metadados
  const s: SecaoA4[] = []
  let n = 0
  const add = (titulo: string, html: string, id?: string) => { n += 1; s.push({ id: id ?? `s${n}`, titulo: `${n}. ${titulo}`, html }) }

  add('Período, escopo e regra do semáforo', `
    <div class="grid2">
      <div class="card"><h4 class="ft">Identificação</h4>${m.filtros.map((x) => `<div class="kv"><span>${esc(x.rotulo)}</span>${esc(x.valor)}</div>`).join('')}
        <div class="kv"><span>Versão</span>v${String(m.versao ?? 0).padStart(2, '0')}</div>
        <div class="kv"><span>Situação</span><b>${esc(m.selo)}</b>${m.pendentes.length ? ` — pendente: ${esc(m.pendentesRotulo.join(', '))}` : ''}</div>
        <div class="kv"><span>Gerado em</span>${esc(m.geradoEmTexto)} (horário de Brasília)</div>
        <div class="kv"><span>Gerado por</span>${esc(m.usuario)}</div></div>
      <div class="card"><h4 class="ft">Regra do semáforo</h4>
        <p class="regra">${pill('VERDE')} Atingiu a meta.</p><p class="regra">${pill('AMARELO')} Fora da meta até 5% de tolerância.</p>
        <p class="regra">${pill('VERMELHO')} Além da tolerância — exige plano de ação.</p>
        <p class="regra">${pill('SEM_META')} Indicador sem meta homologada (não recebe cor de desempenho).</p>
        <p class="sub">${esc(m.regraSemaforo)}.</p></div>
    </div>
    <div class="card avoid"><h4 class="ft">Situação do fechamento por área</h4>
      <table class="t"><thead><tr><th>Área</th><th>Situação</th><th>No escopo</th></tr></thead><tbody>
      ${m.fechamento.map((x) => `<tr><td>${esc(x.areaNome)}</td><td>${['APROVADO', 'FECHADO'].includes(x.status) ? '✓' : '!'} ${esc(x.statusRotulo)}</td><td>${x.noEscopo ? 'Sim' : 'Não'}</td></tr>`).join('')}
      </tbody></table></div>`)

  const essenciais = d.indicadores.filter((i) => i.classe === 'ESSENCIAL')
  add('Resumo executivo', `
    <div class="card avoid"><h4 class="ft">Mensagens-chave</h4><ol class="msgs">${d.mensagens.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    <div class="cont avoid">
      <div style="background:${cor(STATUS_REL.VERDE.fundo)};color:${cor(STATUS_REL.VERDE.cor)}"><b class="ft">${d.semaforo.verde}</b>✓ Na meta</div>
      <div style="background:${cor(STATUS_REL.AMARELO.fundo)};color:${cor(STATUS_REL.AMARELO.cor)}"><b class="ft">${d.semaforo.amarelo}</b>! Atenção</div>
      <div style="background:${cor(STATUS_REL.VERMELHO.fundo)};color:${cor(STATUS_REL.VERMELHO.cor)}"><b class="ft">${d.semaforo.vermelho}</b>▲ Fora da meta</div>
      <div style="background:${cor(COR.neutroFundo)};color:${cor(COR.neutro)}"><b class="ft">${d.semaforo.semMeta + d.semaforo.na}</b>– Sem meta / sem dado</div>
    </div>
    ${essenciais.length ? `<h3 class="ft">Indicadores essenciais — ${esc(m.competenciaRotulo)}</h3>${tabelaIndicadores(essenciais)}` : ''}`)

  const decisoes = d.analises.filter((a) => a.tipo === 'DECISAO_SOLICITADA')
  if (decisoes.length) {
    add('Decisões solicitadas à Diretoria', `<div class="card">${decisoes.map((a) => `<div class="item avoid"><b>${esc(a.fato)}</b>${a.numero ? ` (${esc(a.numero)})` : ''}<div class="sub">${esc([a.areaNome, a.indicadorNome, `resp.: ${a.responsavel}`].filter(Boolean).join(' • '))}</div></div>`).join('')}</div>`)
  }

  for (const sec of SECOES) {
    const inds = d.indicadores.filter((i) => i.secao === sec.id)
    const qs = d.quebras.filter((q) => q.secao === sec.id)
    const ts = d.tabelasExtras.filter((t) => t.secao === sec.id)
    if (!inds.length && !qs.length && !ts.length) continue
    add(sec.titulo, `${inds.length ? tabelaIndicadores(inds) : ''}
      ${inds.length ? `<div class="grid2">${inds.map((i) => cartaoIndicadorA4(i, f)).join('')}</div>` : ''}
      ${qs.map((q) => quebraA4(q, f)).join('')}${ts.map(tabelaExtraA4).join('')}`, `sec-${sec.id}`)
  }

  const grupos: [string, string][] = [['DESTAQUE', 'Destaques'], ['ATENCAO', 'Pontos de atenção'], ['RISCO', 'Riscos'], ['DEPENDENCIA', 'Dependências'], ['EXPLICACAO_DESVIO', 'Explicações de desvio']]
  const blocos = grupos.map(([t, r]) => {
    const it = d.analises.filter((a) => a.tipo === t)
    if (!it.length) return ''
    return `<div class="card avoid"><h4 class="ft">${esc(r)}</h4>${it.map((a) => `<div class="item"><b>${esc(a.fato)}</b>${a.numero ? ` (${esc(a.numero)})` : ''}<div class="sub">${esc([a.areaNome, a.indicadorNome, a.ocorrencia, a.areaDependente ? `depende de: ${a.areaDependente}` : null, `resp.: ${a.responsavel}`].filter(Boolean).join(' • '))}</div></div>`).join('')}</div>`
  }).join('')
  if (blocos.trim()) add('Destaques, riscos e dependências', blocos)

  if (d.planos.length) {
    add('Planos de ação', `<p class="sub">${d.planos.filter((p) => p.vencida).length} vencido(s) de ${d.planos.length} plano(s) em aberto ou criados na competência.</p>
      <table class="t"><thead><tr><th>Código</th><th>Área</th><th>Indicador / ocorrência</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
      ${d.planos.map((p) => `<tr${p.vencida ? ' class="venc"' : ''}><td>${esc(p.codigo)}</td><td>${esc(p.areaNome)}</td><td>${esc(p.indicador)}</td><td>${esc(p.acao)}</td><td>${esc(p.responsavel)}</td><td>${esc(p.prazoTexto)}</td><td>${p.vencida ? '▲ Vencida — ' : ''}${esc(p.statusRotulo)}</td></tr>`).join('')}
      </tbody></table>`)
  }
  if (d.metas.length) {
    add('Metas do próximo ciclo', `<p class="sub">Metas aprovadas vigentes no próximo mês e propostas aguardando aprovação (marcadas como “proposta”).</p>
      <table class="t"><thead><tr><th>Indicador</th><th>Ciclo</th><th>Meta</th><th>Situação</th><th>Vigência</th><th>Fonte</th></tr></thead><tbody>
      ${d.metas.map((x) => `<tr${x.situacao === 'PROPOSTA' ? ' class="prop"' : ''}><td>${esc(x.indicador)}</td><td>${esc(x.ciclo)}</td><td>${esc(x.descricao)}</td><td>${esc(x.situacaoRotulo)}</td><td>${esc(x.vigencia)}</td><td class="sub">${esc(x.fonte)}</td></tr>`).join('')}
      </tbody></table>`)
  }
  if (m.modo === 'COMPLETO' && d.indicadores.length) {
    add('Apêndices — memória de cálculo', d.indicadores.map((i) => `<div class="card avoid"><h4 class="ft">${esc(i.nome)} <span class="sub">(${esc(i.codigo)})</span></h4>
      <div class="kv"><span>Fórmula</span>${esc(i.formula)}</div><div class="kv"><span>Consolidação</span>${esc(i.consolidacao)} — ${esc(i.ano.regra)}</div>
      <div class="kv"><span>Origem</span>${esc(i.origemDados)}</div><div class="kv"><span>Fonte da regra</span>${esc(i.fonteRegra)}</div>
      ${i.pendencias ? `<div class="kv"><span>Pendências</span>${esc(i.pendencias)}</div>` : ''}
      <table class="t"><thead><tr><th>Mês</th>${i.evolucao.map((p) => `<th class="n">${esc(p.rotulo)}</th>`).join('')}</tr></thead>
      <tbody><tr><td>Valor</td>${i.evolucao.map((p) => `<td class="n">${esc(p.texto)}</td>`).join('')}</tr></tbody></table></div>`).join(''))
  }
  add('Notas metodológicas e metadados', `<div class="card">
    <div class="kv"><span>Fonte dos dados</span>${esc(m.fonteDados)}</div>
    <div class="kv"><span>Regra do semáforo</span>${esc(m.regraSemaforo)}.</div>
    <div class="kv"><span>Ausência de dado</span>Valores ausentes aparecem como “Não informado” e nunca como zero; denominador zero aparece como “N/A”.</div>
    <div class="kv"><span>Privacidade</span>Sem e-mails, telefones, IPs ou nomes de solicitantes.${m.anonimizarNomes ? ' Técnicos exibidos por iniciais.' : ''}</div>
    <div class="kv"><span>Hash dos dados</span><code>${esc(d.hash)}</code></div>
    <div class="kv"><span>Gerado em</span>${esc(m.geradoEmTexto)} por ${esc(m.usuario)}</div></div>`)
  return s
}

export function htmlRelatorioA4(d: DadosRelatorio, paginas: Record<string, number> = {}, cssFontes?: string | null): string {
  const f = fontes(d.metadados.fonteExportacao)
  const m = d.metadados
  const secoes = secoesA4(d)
  const css = `
@page{size:A4;margin:24mm 14mm 18mm 14mm}
body{font-size:9pt;line-height:1.35}
h2{font-family:${f.pilhaTitulo};color:${cor(COR.vinho)};font-size:17pt;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid ${cor(COR.dourado)}}
h3{font-size:11pt;color:${cor(COR.tinta)};margin:12px 0 6px}
h4{font-size:10.5pt;color:${cor(COR.vinho)};margin:0 0 6px}
.secao{break-before:page;page-break-before:always}
.capa{height:250mm;background:${cor(COR.vinho)};color:#fff;border-radius:6px;padding:22mm 16mm;position:relative;break-after:page;page-break-after:always}
.capa .marca{font-size:18pt;font-weight:800}
.capa h1{font-family:${f.pilhaCapa};font-size:34pt;font-weight:600;margin:40mm 0 6mm;line-height:1.1}
.capa .comp{font-size:20pt;color:${cor(COR.dourado)};font-weight:700}
.capa .meta{position:absolute;left:16mm;right:16mm;bottom:22mm;background:#7D1C31;border-radius:6px;padding:8mm;display:grid;grid-template-columns:repeat(2,1fr);gap:4mm 8mm}
.capa .meta span{display:block;font-size:8pt;color:#E9D3D6;text-transform:uppercase;font-weight:700;letter-spacing:.04em}
.capa .meta b{font-size:12pt}
.sumario{break-after:page;page-break-after:always}
.sumario li{list-style:none;display:flex;align-items:baseline;font-size:11pt;padding:5px 0;border-bottom:1px dotted ${cor(COR.pedra)}}
.sumario li span.t{flex:1}
.sumario li span.p{font-weight:700;color:${cor(COR.vinho)};min-width:30px;text-align:right}
.card{background:#fff;border:1px solid #E6E1DC;border-radius:6px;padding:9px 11px;margin:0 0 9px;break-inside:avoid;page-break-inside:avoid}
.avoid{break-inside:avoid;page-break-inside:avoid}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}
.grid2 .card{margin:0}
.sub{color:${cor(COR.neutro)};font-size:7.8pt;font-weight:400}
.up{text-transform:uppercase;font-weight:700;letter-spacing:.03em}
.kv{font-size:8.5pt;margin:2px 0}
.kv span{display:inline-block;min-width:92px;color:${cor(COR.neutro)};font-weight:700;margin-right:6px}
.pill{display:inline-block;border-radius:10px;padding:1px 7px;font-weight:700;font-size:7.8pt;white-space:nowrap}
.linha{display:flex;align-items:center;gap:8px;margin:2px 0 4px}
.valor{font-size:18pt;font-weight:800}
.graf svg{width:100%;height:auto;display:block;margin-top:4px}
.t{width:100%;border-collapse:collapse;margin:4px 0 10px;font-size:7.8pt}
.t thead{display:table-header-group}
.t tr{break-inside:avoid;page-break-inside:avoid}
.t th{background:${cor(COR.vinho)};color:#fff;text-align:left;padding:4px 5px;font-family:${f.pilhaTitulo};font-weight:700}
.t td{padding:3px 5px;border-bottom:1px solid #ECE7E2;vertical-align:top}
.t tbody tr:nth-child(even) td{background:#FAF7F4}
.t .n{text-align:right;white-space:nowrap}
.t tr.venc td{color:${cor(COR.vermelho)}}
.t tr.prop td{color:${cor(COR.douradoEscuro)};font-style:italic}
.msgs{padding-left:18px;font-size:10.5pt}
.msgs li{margin:4px 0}
.cont{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 10px}
.cont div{border-radius:6px;padding:8px 10px;font-weight:700;font-size:8.5pt}
.cont b{display:block;font-size:20pt}
.item{padding:5px 0;border-bottom:1px solid #F0EBE6}
.com{margin:6px 0 0 14px;font-size:8pt}
.regra{margin:5px 0;font-size:9pt}
code{font-size:7.5pt;word-break:break-all}
`
  const logo = m.logotipo ? `<img alt="Costa Lavos" src="data:${esc(m.logotipo.mime)};base64,${m.logotipo.base64}" style="height:16mm;max-width:60mm;object-fit:contain">` : `<div class="marca ft">Costa Lavos</div>`
  const capa = `<div class="capa" data-bloco="capa">${logo}
    <h1>${m.escopo === 'CONSOLIDADO' ? 'Relatório Executivo' : `Relatório Executivo — ${esc(m.escopoRotulo)}`}</h1>
    <div class="comp ft">${esc(m.competenciaRotulo)}</div>
    <p style="margin-top:4mm;font-size:12pt;color:#F3E3E6">${esc(m.escopoRotulo)} • Modo ${esc(m.modoRotulo.toLowerCase())} • ${esc(m.unidadesRotulo)}</p>
    <div class="meta">
      <div><span>Versão</span><b>v${String(m.versao ?? 0).padStart(2, '0')}</b></div>
      <div><span>Situação</span><b>${esc(m.selo)}</b></div>
      <div><span>Gerado em</span><b>${esc(m.geradoEmTexto)}</b></div>
      <div><span>Gerado por</span><b>${esc(m.usuario)}</b></div>
      <div style="grid-column:span 2"><span>Classificação</span><b>Confidencial — uso interno</b>${m.pendentes.length ? `<div style="font-size:9pt;margin-top:2mm;color:#FFD7D7">Pendente de aprovação: ${esc(m.pendentesRotulo.join(', '))}</div>` : ''}</div>
    </div></div>`
  const sumario = `<div class="sumario" data-bloco="sumario"><h2>Sumário</h2><ol>${secoes.map((s) => `<li><span class="t">${esc(s.titulo)}</span><span class="p">${paginas[s.id] ?? ''}</span></li>`).join('')}</ol></div>`
  const corpo = secoes.map((s) => `<section class="secao" id="${esc(s.id)}" data-bloco="${esc(s.id)}"><h2>${esc(s.titulo)}</h2>${s.html}</section>`).join('\n')
  return `${cabecalhoHtml(f, m.fonteExportacao === 'OFICIAL', css, `Relatório Executivo — ${m.competenciaRotulo}`, cssFontes)}${capa}${sumario}${corpo}</body></html>`
}

/** Cabeçalho/rodapé do Playwright (A4): período, versão, confidencialidade e página x/y. */
export function moldurasA4(d: DadosRelatorio): { header: string; footer: string } {
  const m = d.metadados
  const base = `font-family:Arial,'Liberation Sans',sans-serif;font-size:7.5pt;color:#5F5A57;width:100%;margin:0 14mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact`
  return {
    header: `<div style="${base};border-bottom:0.5pt solid #D6B46C;padding-bottom:2mm"><span><b style="color:#6A1025">Costa Lavos</b> • Relatório Executivo • ${esc(m.competenciaRotulo)}</span><span>${esc(m.escopoRotulo)} • ${esc(m.modoRotulo)} • v${String(m.versao ?? 0).padStart(2, '0')} • <b style="color:${m.selo === 'OFICIAL' ? '#1F7A4A' : '#A41E22'}">${esc(m.selo)}</b></span></div>`,
    footer: `<div style="${base}"><span>Confidencial — uso interno • Gerado em ${esc(m.geradoEmTexto)}</span><span>Página <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
  }
}

