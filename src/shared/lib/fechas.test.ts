import { describe, it, expect } from 'vitest'
import { fechaEnArgentina } from './fechas'

describe('fechaEnArgentina', () => {
  it('22:00 ART del 30/06 (01:00Z del 01/07) sigue siendo 30/06 — el bug que corrige', () => {
    expect(fechaEnArgentina(new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-30')
  })
  it('mediodía UTC = mismo día en Argentina', () => {
    expect(fechaEnArgentina(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01')
  })
  it('03:00Z = medianoche exacta ART (ya es el día nuevo)', () => {
    expect(fechaEnArgentina(new Date('2026-07-01T03:00:00Z'))).toBe('2026-07-01')
  })
  it('02:59Z = 23:59 ART del día anterior', () => {
    expect(fechaEnArgentina(new Date('2026-07-01T02:59:00Z'))).toBe('2026-06-30')
  })
  it('cambio de año en horario ART', () => {
    // 2027-01-01T02:00:00Z = 2026-12-31 23:00 ART
    expect(fechaEnArgentina(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
  })
})
