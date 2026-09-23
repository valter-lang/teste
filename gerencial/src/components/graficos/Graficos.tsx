'use client'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { COR, fmtNum } from './cores'

const eixo = { fontSize: 11, fill: COR.textoSecundario }
const tooltipEstilo = { contentStyle: { borderRadius: 8, borderColor: '#C9C5C1', fontSize: 12 }, labelStyle: { color: COR.texto, fontWeight: 700 } }

export interface PontoMes { rotulo: string; valor: number | null; atual?: boolean }

/** Evolução mensal: competência selecionada em vermelho, demais em pedra; meta como linha de referência rotulada. */
export function GraficoEvolucao({ dados, meta, casas = 0, unidade = '', altura = 220 }: { dados: PontoMes[]; meta?: number | null; casas?: number; unidade?: string; altura?: number }) {
  return (
    <div style={{ height: altura }} role="img" aria-label="Evolução mensal">
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 18, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={COR.grade} />
          <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmtNum(v, 0)} />
          <Tooltip {...tooltipEstilo} cursor={{ fill: '#F3EFEB' }} formatter={(v) => [`${fmtNum(v as number, casas)}${unidade}`, 'Realizado']} />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {dados.map((d, i) => <Cell key={i} fill={d.atual ? COR.atual : COR.historico} />)}
            <LabelList dataKey="valor" position="top" formatter={(v: unknown) => fmtNum(v as number, casas)} style={{ fontSize: 10, fill: COR.texto }} />
          </Bar>
          {meta !== null && meta !== undefined && (
            <ReferenceLine y={meta} stroke={COR.meta} strokeDasharray="5 4" strokeWidth={2}
              label={{ value: `Meta ${fmtNum(meta, casas)}${unidade}`, position: 'insideTopRight', fill: COR.meta, fontSize: 11, fontWeight: 700 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Linha de evolução (taxas), com meta de referência. */
export function GraficoLinha({ dados, meta, casas = 1, unidade = '', altura = 220 }: { dados: PontoMes[]; meta?: number | null; casas?: number; unidade?: string; altura?: number }) {
  return (
    <div style={{ height: altura }} role="img" aria-label="Evolução mensal">
      <ResponsiveContainer>
        <LineChart data={dados} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COR.grade} />
          <XAxis dataKey="rotulo" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => fmtNum(v, 0)} />
          <Tooltip {...tooltipEstilo} formatter={(v) => [`${fmtNum(v as number, casas)}${unidade}`, 'Realizado']} />
          <Line type="monotone" dataKey="valor" stroke={COR.principal} strokeWidth={2} connectNulls={false}
            dot={{ r: 4, fill: COR.principal, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }}>
            <LabelList dataKey="valor" position="top" formatter={(v: unknown) => fmtNum(v as number, casas)} style={{ fontSize: 10, fill: COR.texto }} />
          </Line>
          {meta !== null && meta !== undefined && (
            <ReferenceLine y={meta} stroke={COR.meta} strokeDasharray="5 4" strokeWidth={2}
              label={{ value: `Meta ${fmtNum(meta, casas)}${unidade}`, position: 'insideTopRight', fill: COR.meta, fontSize: 11, fontWeight: 700 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface ItemRanking { dimensao: string; valor: number; destaque?: boolean; acumulado?: number }

/**
 * Ranking/Pareto horizontal (um eixo só): itens que somam até 80% em vinho, demais em pedra;
 * o acumulado aparece no rótulo, sem segundo eixo.
 */
export function GraficoRanking({ dados, casas = 0, unidade = '', altura }: { dados: ItemRanking[]; casas?: number; unidade?: string; altura?: number }) {
  const h = altura ?? Math.max(120, dados.length * 28 + 30)
  return (
    <div style={{ height: h }} role="img" aria-label="Ranking">
      <ResponsiveContainer>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 90, left: 8, bottom: 4 }} barCategoryGap="22%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="dimensao" tick={{ ...eixo, fontSize: 11 }} width={150} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipEstilo} cursor={{ fill: '#F3EFEB' }}
            formatter={(v, _n, p) => [`${fmtNum(v as number, casas)}${unidade}${(p?.payload as ItemRanking)?.acumulado !== undefined ? ` · acumulado ${fmtNum((p.payload as ItemRanking).acumulado, 1)}%` : ''}`, 'Valor']} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {dados.map((d, i) => <Cell key={i} fill={d.destaque === false ? COR.historico : COR.principal} />)}
            <LabelList dataKey="valor" position="right" style={{ fontSize: 11, fill: COR.texto }}
              formatter={(v: unknown) => `${fmtNum(v as number, casas)}${unidade}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface SerieComparada { dimensao: string; [mes: string]: number | string | null }

/** Comparativo por dimensão para 3 competências (ex.: MAI • JUN • JUL): atual em vermelho. */
export function GraficoComparativo({ dados, meses, casas = 0, altura = 260 }: { dados: SerieComparada[]; meses: { chave: string; rotulo: string }[]; casas?: number; altura?: number }) {
  const cores = [COR.historicoClaro, COR.historico, COR.atual]
  const offset = cores.length - meses.length
  return (
    <div style={{ height: altura }} role="img" aria-label="Comparativo por dimensão">
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 18, right: 8, left: 0, bottom: 40 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={COR.grade} />
          <XAxis dataKey="dimensao" tick={{ ...eixo, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...tooltipEstilo} cursor={{ fill: '#F3EFEB' }} formatter={(v) => fmtNum(v as number, casas)} />
          <Legend verticalAlign="top" height={24} iconType="square" wrapperStyle={{ fontSize: 12, color: COR.texto }} />
          {meses.map((m, i) => (
            <Bar key={m.chave} dataKey={m.chave} name={m.rotulo} fill={cores[i + offset]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
