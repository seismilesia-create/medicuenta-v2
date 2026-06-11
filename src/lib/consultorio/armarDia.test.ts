import { describe, it, expect } from 'vitest'
import { armarDia, type ItemDia } from './armarDia'

const NOW = new Date('2026-06-15T13:00:00.000Z').getTime() // 10:00 AR

const turno = (h: string, estado = 'reservado', extra = {}) => ({
  id: `t-${h}`,
  starts_at: `2026-06-15T${h}:00.000Z`,
  ends_at: `2026-06-15T${h}:00.000Z`,
  estado,
  paciente_nombre: 'Ana',
  paciente_apellido: 'Ríos',
  paciente_dni: '30111222',
  paciente_obra_social: 'OSEP',
  paciente_telefono: '543834222049',
  notas: null,
  origen: 'bot',
  ...extra,
})

const slot = (h: string, label: string) => ({
  startsAt: `2026-06-15T${h}:00.000Z`,
  endsAt: `2026-06-15T${h}:00.000Z`,
  label,
})

describe('armarDia', () => {
  it('mezcla turnos y huecos en orden cronológico', () => {
    const items = armarDia([turno('12:00')], [slot('15:30', '12:30')], NOW)
    expect(items.map((i) => i.tipo)).toEqual(['turno', 'libre'])
  })

  it('los cancelados NO aparecen (su hueco vuelve como libre vía slots)', () => {
    const items = armarDia([turno('12:00', 'cancelado')], [], NOW)
    expect(items).toEqual([])
  })

  it('cada turno lleva su estado efectivo (pasado sin marca = atendido)', () => {
    const items = armarDia([turno('12:00'), turno('19:00')], [], NOW)
    const turnos = items.filter((i): i is Extract<ItemDia, { tipo: 'turno' }> => i.tipo === 'turno')
    expect(turnos[0].estadoEfectivo).toBe('atendido') // 09:00 AR, ya pasó
    expect(turnos[1].estadoEfectivo).toBe('proximo') // 16:00 AR, futuro
  })

  it('ausente marcado → no_vino', () => {
    const items = armarDia([turno('12:00', 'ausente')], [], NOW)
    expect((items[0] as Extract<ItemDia, { tipo: 'turno' }>).estadoEfectivo).toBe('no_vino')
  })

  it('huecos intercalados entre turnos quedan en su lugar', () => {
    const items = armarDia([turno('12:00'), turno('13:00')], [slot('12:30', '09:30')], NOW)
    expect(items.map((i) => (i.tipo === 'turno' ? `T${i.turno.starts_at.slice(11, 16)}` : `L${i.label}`))).toEqual([
      'T12:00',
      'L09:30',
      'T13:00',
    ])
  })
})
