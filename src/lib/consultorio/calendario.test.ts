import { describe, it, expect } from 'vitest'
import { addDias, inicioSemana, gridMes, diasDesdeHoy, minutosAR, minutosDeHora } from './calendario'

const NOW = new Date('2026-06-15T13:00:00.000Z').getTime() // 10:00 AR (lunes)

describe('addDias', () => {
  it('suma días dentro del mes', () => {
    expect(addDias('2026-06-12', 3)).toBe('2026-06-15')
  })

  it('cruza el mes y el año', () => {
    expect(addDias('2026-06-29', 7)).toBe('2026-07-06')
    expect(addDias('2026-12-30', 5)).toBe('2027-01-04')
  })

  it('resta con n negativo', () => {
    expect(addDias('2026-06-01', -1)).toBe('2026-05-31')
  })

  it('respeta el año bisiesto', () => {
    expect(addDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDias('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('inicioSemana', () => {
  it('un lunes es su propio inicio', () => {
    expect(inicioSemana('2026-06-15')).toBe('2026-06-15')
  })

  it('mitad de semana vuelve al lunes', () => {
    expect(inicioSemana('2026-06-17')).toBe('2026-06-15') // miércoles
  })

  it('el domingo pertenece a la semana del lunes ANTERIOR', () => {
    expect(inicioSemana('2026-06-21')).toBe('2026-06-15')
  })
})

describe('gridMes', () => {
  it('junio 2026 (empieza en lunes): 5 semanas exactas con relleno de julio al final', () => {
    const g = gridMes(2026, 6)
    expect(g).toHaveLength(5)
    expect(g[0][0]).toBe('2026-06-01')
    expect(g[4][6]).toBe('2026-07-05')
  })

  it('febrero 2026 (empieza en domingo): rellena con enero adelante y marzo al final', () => {
    const g = gridMes(2026, 2)
    expect(g).toHaveLength(5)
    expect(g[0][0]).toBe('2026-01-26')
    expect(g[0][6]).toBe('2026-02-01')
    expect(g[4][6]).toBe('2026-03-01')
  })

  it('agosto 2026 necesita 6 semanas', () => {
    const g = gridMes(2026, 8)
    expect(g).toHaveLength(6)
    expect(g[0][0]).toBe('2026-07-27')
    expect(g[5][0]).toBe('2026-08-31')
  })

  it('toda semana tiene 7 días consecutivos', () => {
    for (const semana of gridMes(2026, 8)) {
      expect(semana).toHaveLength(7)
      for (let i = 1; i < 7; i++) expect(semana[i]).toBe(addDias(semana[i - 1], 1))
    }
  })
})

describe('diasDesdeHoy', () => {
  it('hoy = 0, mañana = 1, ayer = -1', () => {
    expect(diasDesdeHoy('2026-06-15', NOW)).toBe(0)
    expect(diasDesdeHoy('2026-06-16', NOW)).toBe(1)
    expect(diasDesdeHoy('2026-06-14', NOW)).toBe(-1)
  })

  it('usa el día AR, no el UTC (23:00 AR del 14 sigue siendo "hoy=14")', () => {
    const nowTardeNoche = new Date('2026-06-15T02:00:00.000Z').getTime() // 23:00 AR del 14
    expect(diasDesdeHoy('2026-06-15', nowTardeNoche)).toBe(1)
    expect(diasDesdeHoy('2026-06-14', nowTardeNoche)).toBe(0)
  })
})

describe('minutosAR / minutosDeHora', () => {
  it('convierte un instante UTC a minutos del día AR', () => {
    expect(minutosAR('2026-06-15T13:00:00.000Z')).toBe(600) // 10:00 AR
    expect(minutosAR('2026-06-15T02:30:00.000Z')).toBe(23 * 60 + 30) // 23:30 AR del 14
  })

  it('convierte HH:MM y HH:MM:SS a minutos', () => {
    expect(minutosDeHora('09:30')).toBe(570)
    expect(minutosDeHora('09:30:00')).toBe(570)
    expect(minutosDeHora('00:00')).toBe(0)
  })
})
