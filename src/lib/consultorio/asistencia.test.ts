import { describe, it, expect } from 'vitest'
import { estadoEfectivoTurno } from './asistencia'

const NOW = new Date('2026-06-15T15:00:00.000Z').getTime()

describe('estadoEfectivoTurno', () => {
  it('cancelado manda, pasado o futuro', () => {
    expect(estadoEfectivoTurno({ estado: 'cancelado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('cancelado')
    expect(estadoEfectivoTurno({ estado: 'cancelado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('cancelado')
  })

  it('ausente marcado → no_vino', () => {
    expect(estadoEfectivoTurno({ estado: 'ausente', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('no_vino')
  })

  it('futuro (reservado o confirmado) → proximo', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('proximo')
    expect(estadoEfectivoTurno({ estado: 'confirmado', starts_at: '2026-06-16T12:00:00.000Z' }, NOW)).toBe('proximo')
  })

  it('pasado sin marca → atendido (la regla anti-fricción del spec)', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('atendido')
    expect(estadoEfectivoTurno({ estado: 'completado', starts_at: '2026-06-15T12:00:00.000Z' }, NOW)).toBe('atendido')
  })

  it('starts_at inválido → proximo (no inventa asistencia con datos rotos)', () => {
    expect(estadoEfectivoTurno({ estado: 'reservado', starts_at: 'no-es-fecha' }, NOW)).toBe('proximo')
  })
})
