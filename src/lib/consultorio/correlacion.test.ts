import { describe, it, expect } from 'vitest'
import {
  esTurnoAtendido,
  esSobreturnoAtendido,
  construirSugerencias,
  controlQuinceMinutos,
  type TurnoCrudo,
  type SobreturnoCrudo,
} from './correlacion'

// Lunes 2026-06-15, 10:00 AR (AR = UTC-3, así que 13:00 UTC).
const NOW = new Date('2026-06-15T13:00:00.000Z').getTime()

function turno(over: Partial<TurnoCrudo>): TurnoCrudo {
  return {
    id: 't1',
    starts_at: '2026-06-12T13:30:00.000Z', // jue 12, 10:30 AR (pasado)
    estado: 'reservado',
    paciente_nombre: 'Juan',
    paciente_apellido: 'Pérez',
    ...over,
  }
}

function sobreturno(over: Partial<SobreturnoCrudo>): SobreturnoCrudo {
  return {
    id: 's1',
    fecha: '2026-06-10',
    estado: 'atendido',
    paciente_nombre: 'Ana',
    paciente_apellido: 'Gómez',
    ...over,
  }
}

describe('esTurnoAtendido', () => {
  it('un turno pasado no cancelado se asume atendido', () => {
    expect(esTurnoAtendido(turno({ estado: 'reservado' }), NOW)).toBe(true)
    expect(esTurnoAtendido(turno({ estado: 'confirmado' }), NOW)).toBe(true)
    expect(esTurnoAtendido(turno({ estado: 'completado' }), NOW)).toBe(true)
  })

  it('cancelado o ausente NO cuentan', () => {
    expect(esTurnoAtendido(turno({ estado: 'cancelado' }), NOW)).toBe(false)
    expect(esTurnoAtendido(turno({ estado: 'ausente' }), NOW)).toBe(false)
  })

  it('un turno futuro no cuenta todavía', () => {
    expect(esTurnoAtendido(turno({ starts_at: '2026-06-20T13:30:00.000Z' }), NOW)).toBe(false)
  })

  it('el límite: justo ahora cuenta como atendido', () => {
    expect(esTurnoAtendido(turno({ starts_at: '2026-06-15T13:00:00.000Z' }), NOW)).toBe(true)
  })
})

describe('esSobreturnoAtendido', () => {
  it('fecha hoy o anterior, no cancelado, cuenta', () => {
    expect(esSobreturnoAtendido(sobreturno({ fecha: '2026-06-10', estado: 'pendiente' }), NOW)).toBe(true)
    expect(esSobreturnoAtendido(sobreturno({ fecha: '2026-06-15', estado: 'atendido' }), NOW)).toBe(true)
  })

  it('cancelado o no_vino NO cuentan', () => {
    expect(esSobreturnoAtendido(sobreturno({ estado: 'cancelado' }), NOW)).toBe(false)
    expect(esSobreturnoAtendido(sobreturno({ estado: 'no_vino' }), NOW)).toBe(false)
  })

  it('fecha futura no cuenta', () => {
    expect(esSobreturnoAtendido(sobreturno({ fecha: '2026-06-20' }), NOW)).toBe(false)
  })
})

describe('construirSugerencias', () => {
  it('formatea fecha AR y hora HH:MM del turno', () => {
    const [s] = construirSugerencias([turno({})], [], NOW)
    expect(s.tipo).toBe('turno')
    expect(s.fecha).toBe('2026-06-12')
    expect(s.hora).toBe('10:30')
    expect(s.paciente).toBe('Pérez, Juan')
  })

  it('el sobreturno no tiene hora', () => {
    const [s] = construirSugerencias([], [sobreturno({})], NOW)
    expect(s.tipo).toBe('sobreturno')
    expect(s.fecha).toBe('2026-06-10')
    expect(s.hora).toBeNull()
  })

  it('descarta los no atendidos', () => {
    const res = construirSugerencias(
      [turno({ id: 'ok' }), turno({ id: 'cancel', estado: 'cancelado' })],
      [sobreturno({ id: 'sok' }), sobreturno({ id: 'sno', estado: 'no_vino' })],
      NOW,
    )
    expect(res.map((s) => s.id).sort()).toEqual(['ok', 'sok'])
  })

  it('ordena de la atención más reciente a la más vieja', () => {
    const res = construirSugerencias(
      [
        turno({ id: 'viejo', starts_at: '2026-06-10T13:00:00.000Z' }), // 10/06 10:00
        turno({ id: 'nuevo', starts_at: '2026-06-12T16:00:00.000Z' }), // 12/06 13:00
        turno({ id: 'mismodia-temprano', starts_at: '2026-06-12T12:00:00.000Z' }), // 12/06 09:00
      ],
      [],
      NOW,
    )
    expect(res.map((s) => s.id)).toEqual(['nuevo', 'mismodia-temprano', 'viejo'])
  })

  it('dentro del mismo día, los sobreturnos (sin hora) van al final', () => {
    const res = construirSugerencias(
      [turno({ id: 'conhora', starts_at: '2026-06-12T12:00:00.000Z' })],
      [sobreturno({ id: 'sinhora', fecha: '2026-06-12' })],
      NOW,
    )
    expect(res.map((s) => s.id)).toEqual(['conhora', 'sinhora'])
  })
})

describe('controlQuinceMinutos', () => {
  it('detecta una atención a menos de 15 minutos', () => {
    const c = controlQuinceMinutos('10:30', [{ hora: '10:20', paciente: 'Pérez' }])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ paciente: 'Pérez', hora: '10:20', brecha: 10 })
  })

  it('exactamente 15 minutos NO es conflicto (es el mínimo permitido)', () => {
    expect(controlQuinceMinutos('10:30', [{ hora: '10:45' }])).toHaveLength(0)
    expect(controlQuinceMinutos('10:30', [{ hora: '10:15' }])).toHaveLength(0)
  })

  it('más de 15 minutos está OK', () => {
    expect(controlQuinceMinutos('10:30', [{ hora: '11:00' }])).toHaveLength(0)
  })

  it('ordena los conflictos por cercanía (menor brecha primero)', () => {
    const c = controlQuinceMinutos('10:30', [
      { hora: '10:25', paciente: 'B' }, // 5
      { hora: '10:38', paciente: 'A' }, // 8
      { hora: '12:00', paciente: 'lejos' }, // 90, descartado
    ])
    expect(c.map((x) => x.paciente)).toEqual(['B', 'A'])
  })

  it('hora nueva vacía o inválida → sin conflictos', () => {
    expect(controlQuinceMinutos(null, [{ hora: '10:20' }])).toHaveLength(0)
    expect(controlQuinceMinutos('', [{ hora: '10:20' }])).toHaveLength(0)
    expect(controlQuinceMinutos('sin hora', [{ hora: '10:20' }])).toHaveLength(0)
  })

  it('sin otras órdenes → sin conflictos', () => {
    expect(controlQuinceMinutos('10:30', [])).toHaveLength(0)
  })

  it('ignora otras órdenes sin horario cargado', () => {
    expect(controlQuinceMinutos('10:30', [{ hora: '' }, { hora: '10:28' }])).toHaveLength(1)
  })
})
