import { describe, it, expect } from 'vitest'
import { esDiaParticular, type DiaParticular } from './diasParticulares'

// 2026-07-17 es VIERNES (weekday 5) en hora AR; 2026-07-14 es MARTES.
const viernesSemanal: DiaParticular = { tipo: 'semanal', dia_semana: 5, fecha: null }
const fechaPuntual: DiaParticular = { tipo: 'fecha', dia_semana: null, fecha: '2026-07-14' }

describe('esDiaParticular', () => {
  it('true cuando la fecha coincide con una fila puntual', () => {
    expect(esDiaParticular([fechaPuntual], '2026-07-14')).toBe(true)
  })
  it('true cuando el día de la semana coincide con una fila semanal', () => {
    expect(esDiaParticular([viernesSemanal], '2026-07-17')).toBe(true) // viernes
  })
  it('false cuando ni la fecha ni el weekday coinciden', () => {
    expect(esDiaParticular([viernesSemanal, fechaPuntual], '2026-07-15')).toBe(false) // miércoles, no puntual
  })
  it('lista vacía → false', () => {
    expect(esDiaParticular([], '2026-07-17')).toBe(false)
  })
  it('combina: un viernes distinto al puntual igual es particular por la regla semanal', () => {
    expect(esDiaParticular([viernesSemanal], '2026-07-24')).toBe(true) // otro viernes
  })
})
