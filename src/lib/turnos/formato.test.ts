import { describe, it, expect } from 'vitest'
import { armarStartsAtISO, fmtFechaLarga, fmtHora } from './formato'

describe('armarStartsAtISO', () => {
  it('combina fecha + hora en hora argentina → ISO UTC', () => {
    expect(armarStartsAtISO('2026-06-15', '09:00')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('normaliza H:MM a HH:MM', () => {
    expect(armarStartsAtISO('2026-06-15', '9:00')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('tolera espacios alrededor', () => {
    expect(armarStartsAtISO(' 2026-06-15 ', ' 09:00 ')).toBe('2026-06-15T12:00:00.000Z')
  })

  it('rechaza formatos inválidos (la IA a veces manda cualquier cosa)', () => {
    expect(armarStartsAtISO('15/06/2026', '09:00')).toBeNull()
    expect(armarStartsAtISO('2026-06-15', '9am')).toBeNull()
    expect(armarStartsAtISO('2026-06-15', '09:00:00')).toBeNull()
    expect(armarStartsAtISO('', '')).toBeNull()
  })
})

describe('fmtFechaLarga / fmtHora', () => {
  // 2026-06-15T12:00:00Z = lunes 15 de junio, 09:00 hora argentina
  it('fmtFechaLarga devuelve día de semana, número y mes en es-AR', () => {
    const s = fmtFechaLarga('2026-06-15T12:00:00.000Z')
    expect(s).toContain('lunes')
    expect(s).toContain('15')
    expect(s).toContain('junio')
  })

  it('fmtHora devuelve HH:MM de 24h en hora argentina', () => {
    expect(fmtHora('2026-06-15T12:00:00.000Z')).toBe('09:00')
  })
})
