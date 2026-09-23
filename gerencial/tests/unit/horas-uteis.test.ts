import { describe, expect, it } from 'vitest'
import { horasUteis, somarHorasUteis, diasUteisEntre, CALENDARIO_PADRAO, type Calendario } from '@/lib/horas-uteis'

const cal: Calendario = { ...CALENDARIO_PADRAO, feriados: new Set(['2026-09-07']) }
const d = (s: string) => new Date(s)

describe('horas úteis (America/Sao_Paulo, 08:00–18:00, seg–sex)', () => {
  it('mesmo dia dentro do expediente', () => {
    expect(horasUteis(d('2026-08-31T09:00:00-03:00'), d('2026-08-31T12:30:00-03:00'), cal)).toBe(3.5)
  })
  it('ignora noite e fim de semana', () => {
    // sexta 17:00 -> segunda 09:00 = 1h (sex) + 1h (seg)
    expect(horasUteis(d('2026-08-28T17:00:00-03:00'), d('2026-08-31T09:00:00-03:00'), cal)).toBe(2)
  })
  it('ignora feriado (07/09/2026)', () => {
    // sexta 04/09 18:00 -> terça 08/09 10:00 = 2h
    expect(horasUteis(d('2026-09-04T18:00:00-03:00'), d('2026-09-08T10:00:00-03:00'), cal)).toBe(2)
  })
  it('desconta pausas válidas apenas na sobreposição com o expediente', () => {
    const h = horasUteis(d('2026-08-31T08:00:00-03:00'), d('2026-08-31T18:00:00-03:00'), cal, [[d('2026-08-31T12:00:00-03:00'), d('2026-08-31T13:00:00-03:00')]])
    expect(h).toBe(9)
  })
  it('prazo de 48 horas úteis a partir de sexta 16:00 (com feriado na segunda)', () => {
    // 48h úteis = 4,8 dias de 10h. sex 16-18 (2h) ; ter 8, qua 9, qui 10, sex 11 = 40h -> total 42h ; seg 14/09 +6h -> 14:00
    const p = somarHorasUteis(d('2026-09-04T16:00:00-03:00'), 48, cal)
    expect(p.toISOString()).toBe(new Date('2026-09-14T14:00:00-03:00').toISOString())
  })
  it('início fora do expediente começa na próxima janela', () => {
    const p = somarHorasUteis(d('2026-08-31T06:00:00-03:00'), 1, cal)
    expect(p.toISOString()).toBe(new Date('2026-08-31T09:00:00-03:00').toISOString())
  })
  it('intervalo invertido = 0', () => {
    expect(horasUteis(d('2026-08-31T12:00:00-03:00'), d('2026-08-31T09:00:00-03:00'), cal)).toBe(0)
  })
  it('dias úteis', () => {
    expect(diasUteisEntre(d('2026-08-24T08:00:00-03:00'), d('2026-09-04T18:00:00-03:00'), cal)).toBe(10)
  })
})
