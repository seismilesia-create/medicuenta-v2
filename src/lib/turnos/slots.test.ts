import { describe, it, expect } from 'vitest'
import {
  computeSlotsForDate,
  arDateString,
  weekdayOf,
  pickException,
  resolveDayHours,
  esSlotOfrecido,
  estaDentroDelHorario,
  estaDentroConGracia,
  type ScheduleExceptionLite,
  type DayAvailability,
} from './slots'

// 2026-06-15 es lunes. 09:00 AR (-03:00) = 12:00 UTC.

describe('computeSlotsForDate', () => {
  const hours = [{ open_time: '09:00', close_time: '12:00' }]

  it('genera slots cada `durationMin` dentro del bloque, en UTC con label AR', () => {
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00', '11:00'])
    expect(slots[0].startsAt).toBe('2026-06-15T12:00:00.000Z')
    expect(slots[0].endsAt).toBe('2026-06-15T13:00:00.000Z')
  })

  it('el último slot tiene que ENTRAR completo antes del cierre', () => {
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 45, hours, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '09:45', '10:30', '11:15'])
  })

  it('acepta open/close con segundos (formato TIME de Postgres)', () => {
    const conSegundos = [{ open_time: '09:00:00', close_time: '11:00:00' }]
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours: conSegundos, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00'])
  })

  it('excluye slots que solapan turnos ocupados', () => {
    const busy = [{ starts_at: '2026-06-15T13:00:00.000Z', ends_at: '2026-06-15T14:00:00.000Z' }] // 10–11 AR
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '11:00'])
  })

  it('excluye slots que el turno ocupado atraviesa parcialmente', () => {
    const busy = [{ starts_at: '2026-06-15T13:30:00.000Z', ends_at: '2026-06-15T14:30:00.000Z' }] // 10:30–11:30 AR
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy })
    expect(slots.map((s) => s.label)).toEqual(['09:00'])
  })

  it('stepMin menor que la duración genera slots superpuestos cada stepMin', () => {
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, stepMin: 30, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00'])
  })

  it('descarta slots en el pasado si se pasa nowMs', () => {
    const nowMs = new Date('2026-06-15T13:30:00.000Z').getTime() // 10:30 AR
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours, busy: [], nowMs })
    expect(slots.map((s) => s.label)).toEqual(['11:00'])
  })

  it('soporta dos bloques (mañana y tarde, siesta en el medio)', () => {
    const dosBloques = [
      { open_time: '09:00', close_time: '11:00' },
      { open_time: '17:00', close_time: '19:00' },
    ]
    const slots = computeSlotsForDate({ date: '2026-06-15', durationMin: 60, hours: dosBloques, busy: [] })
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00', '17:00', '18:00'])
  })
})

describe('arDateString / weekdayOf', () => {
  it('arDateString devuelve YYYY-MM-DD en hora AR con offset de días', () => {
    const base = new Date('2026-06-15T12:00:00.000Z').getTime()
    expect(arDateString(base, 0)).toBe('2026-06-15')
    expect(arDateString(base, 2)).toBe('2026-06-17')
  })

  it('weekdayOf: lunes=1, domingo=0', () => {
    expect(weekdayOf('2026-06-15')).toBe(1)
    expect(weekdayOf('2026-06-14')).toBe(0)
  })
})

describe('pickException', () => {
  const cerrado: ScheduleExceptionLite = { start_date: '2026-07-09', end_date: '2026-07-09', kind: 'closed', ranges: [] }
  const especial: ScheduleExceptionLite = {
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    kind: 'custom',
    ranges: [{ open: '10:00', close: '13:00' }],
  }

  it('precedencia: closed gana sobre custom cuando ambas cubren la fecha', () => {
    expect(pickException('2026-07-09', [especial, cerrado])?.kind).toBe('closed')
  })

  it('fecha sin excepción que la cubra → null', () => {
    expect(pickException('2026-08-01', [especial, cerrado])).toBeNull()
  })
})

describe('resolveDayHours', () => {
  const weekly = [
    { weekday: 1, open_time: '09:00', close_time: '13:00' },
    { weekday: 1, open_time: '17:00', close_time: '20:00' },
    { weekday: 3, open_time: '09:00', close_time: '13:00' },
  ]

  it('día cerrado por excepción', () => {
    const r = resolveDayHours({
      date: '2026-06-15',
      weekday: 1,
      weekly,
      exceptions: [{ start_date: '2026-06-15', end_date: '2026-06-15', kind: 'closed', ranges: [] }],
    })
    expect(r.closed).toBe(true)
    expect(r.hours).toEqual([])
  })

  it('horario especial (custom) pisa al semanal', () => {
    const r = resolveDayHours({
      date: '2026-06-15',
      weekday: 1,
      weekly,
      exceptions: [
        { start_date: '2026-06-15', end_date: '2026-06-15', kind: 'custom', ranges: [{ open: '10:00', close: '12:00' }] },
      ],
    })
    expect(r.closed).toBe(false)
    expect(r.hours).toEqual([{ open_time: '10:00', close_time: '12:00' }])
  })

  it('sin excepción → los bloques del weekday', () => {
    const r = resolveDayHours({ date: '2026-06-15', weekday: 1, weekly, exceptions: [] })
    expect(r.hours).toHaveLength(2)
  })

  it('weekday sin horario cargado → sin bloques (no atiende ese día)', () => {
    const r = resolveDayHours({ date: '2026-06-16', weekday: 2, weekly, exceptions: [] })
    expect(r.closed).toBe(false)
    expect(r.hours).toEqual([])
  })

  it("excepción 'open' → usa el horario semanal igual", () => {
    const r = resolveDayHours({
      date: '2026-06-15',
      weekday: 1,
      weekly,
      exceptions: [{ start_date: '2026-06-15', end_date: '2026-06-15', kind: 'open', ranges: [] }],
    })
    expect(r.closed).toBe(false)
    expect(r.hours).toHaveLength(2)
  })
})

describe('esSlotOfrecido', () => {
  const dias: DayAvailability[] = [
    {
      date: '2026-06-15',
      weekday: 1,
      slots: [{ startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T12:30:00.000Z', label: '09:00' }],
    },
  ]

  it('true para un slot exactamente ofrecido', () => {
    expect(esSlotOfrecido(dias, '2026-06-15T12:00:00.000Z')).toBe(true)
  })

  it('false para un horario no ofrecido (anti-horario-inventado)', () => {
    expect(esSlotOfrecido(dias, '2026-06-15T12:15:00.000Z')).toBe(false)
  })

  it('acepta el mismo instante en otra representación ISO válida', () => {
    expect(esSlotOfrecido(dias, '2026-06-15T12:00:00Z')).toBe(true)
  })

  it('rechaza strings que no son fechas', () => {
    expect(esSlotOfrecido(dias, 'mañana a la tarde')).toBe(false)
  })
})

describe('estaDentroDelHorario', () => {
  // Derivamos el weekday del instante para no hardcodear qué día cae cada fecha.
  const bloque = (ahoraMs: number, open: string, close: string) => [{
    weekday: weekdayOf(arDateString(ahoraMs)), open_time: open, close_time: close,
  }]

  it('dentro del bloque → true', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime() // 10:00 AR
    expect(estaDentroDelHorario({ ahoraMs, weekly: bloque(ahoraMs, '09:00', '13:00'), exceptions: [] })).toBe(true)
  })

  it('límite de apertura es inclusivo, el de cierre exclusivo', () => {
    const apertura = new Date('2026-07-06T12:00:00Z').getTime() // 09:00 AR exacto
    expect(estaDentroDelHorario({ ahoraMs: apertura, weekly: bloque(apertura, '09:00', '13:00'), exceptions: [] })).toBe(true)
    const cierre = new Date('2026-07-06T16:00:00Z').getTime() // 13:00 AR exacto
    expect(estaDentroDelHorario({ ahoraMs: cierre, weekly: bloque(cierre, '09:00', '13:00'), exceptions: [] })).toBe(false)
  })

  it('fuera del bloque → false', () => {
    const ahoraMs = new Date('2026-07-06T22:00:00Z').getTime() // 19:00 AR
    expect(estaDentroDelHorario({ ahoraMs, weekly: bloque(ahoraMs, '09:00', '13:00'), exceptions: [] })).toBe(false)
  })

  it('sin horario cargado ese día → false', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime()
    const otroDia = (weekdayOf(arDateString(ahoraMs)) + 1) % 7
    expect(estaDentroDelHorario({ ahoraMs, weekly: [{ weekday: otroDia, open_time: '09:00', close_time: '13:00' }], exceptions: [] })).toBe(false)
  })

  it('excepción "closed" ese día → false aunque haya horario semanal', () => {
    const ahoraMs = new Date('2026-07-06T13:00:00Z').getTime()
    const date = arDateString(ahoraMs)
    expect(estaDentroDelHorario({
      ahoraMs,
      weekly: bloque(ahoraMs, '09:00', '13:00'),
      exceptions: [{ start_date: date, end_date: date, kind: 'closed', ranges: [] }],
    })).toBe(false)
  })
})

describe('estaDentroConGracia', () => {
  const bloque = (ahoraMs: number, open: string, close: string) => [{
    weekday: weekdayOf(arDateString(ahoraMs)), open_time: open, close_time: close,
  }]
  // 2026-07-06: bloque 09:00–13:00 AR. 13:00 AR = 16:00 UTC.
  const conGracia = (ahoraMs: number) =>
    estaDentroConGracia({ ahoraMs, weekly: bloque(ahoraMs, '09:00', '13:00'), exceptions: [], graciaMin: 15 })

  it('dentro del horario → true (igual que sin gracia)', () => {
    expect(conGracia(new Date('2026-07-06T14:00:00Z').getTime())).toBe(true) // 11:00 AR
  })

  it('justo al cierre y dentro de la gracia → true', () => {
    expect(conGracia(new Date('2026-07-06T16:00:00Z').getTime())).toBe(true) // 13:00 AR (cierre exacto)
    expect(conGracia(new Date('2026-07-06T16:10:00Z').getTime())).toBe(true) // 13:10 AR (10 min pasado)
  })

  it('pasada la gracia → false', () => {
    expect(conGracia(new Date('2026-07-06T16:20:00Z').getTime())).toBe(false) // 13:20 AR (20 min pasado)
  })

  it('antes de abrir NO se adelanta la ventana → false', () => {
    expect(conGracia(new Date('2026-07-06T11:50:00Z').getTime())).toBe(false) // 08:50 AR
  })
})
