import { describe, it, expect } from 'vitest'
import {
  rutaEsFull,
  puedeAcceder,
  normalizarPlan,
  normalizarEstado,
  resolverAcceso,
  debeMostrarModalPrueba,
  TRIAL_DIAS,
} from './planes'

describe('rutaEsFull', () => {
  it('las rutas del consultorio son Full', () => {
    expect(rutaEsFull('/agenda')).toBe(true)
    expect(rutaEsFull('/conversaciones')).toBe(true)
    expect(rutaEsFull('/pacientes')).toBe(true)
    expect(rutaEsFull('/consultorio/config')).toBe(true)
    expect(rutaEsFull('/agenda/2026-06-12')).toBe(true)
  })

  it('las rutas de facturación NO son Full', () => {
    expect(rutaEsFull('/dashboard')).toBe(false)
    expect(rutaEsFull('/ordenes')).toBe(false)
    expect(rutaEsFull('/ordenes/nueva')).toBe(false)
    expect(rutaEsFull('/liquidaciones')).toBe(false)
    expect(rutaEsFull('/nomenclador')).toBe(false)
    expect(rutaEsFull('/asistente')).toBe(false) // asistente IA de facturación = Básico
    expect(rutaEsFull('/perfil')).toBe(false)
  })

  it('no confunde prefijos parecidos', () => {
    expect(rutaEsFull('/pacientes-otra-cosa')).toBe(false)
    expect(rutaEsFull('/agendado')).toBe(false)
  })
})

describe('puedeAcceder', () => {
  it('Full accede a todo', () => {
    expect(puedeAcceder('full', '/agenda')).toBe(true)
    expect(puedeAcceder('full', '/dashboard')).toBe(true)
  })

  it('Básico accede a facturación pero NO al consultorio', () => {
    expect(puedeAcceder('basico', '/dashboard')).toBe(true)
    expect(puedeAcceder('basico', '/ordenes')).toBe(true)
    expect(puedeAcceder('basico', '/agenda')).toBe(false)
    expect(puedeAcceder('basico', '/consultorio/config')).toBe(false)
  })
})

describe('normalizarPlan', () => {
  it('solo "full" es full; el resto (incluido null) es básico', () => {
    expect(normalizarPlan('full')).toBe('full')
    expect(normalizarPlan('basico')).toBe('basico')
    expect(normalizarPlan(null)).toBe('basico')
    expect(normalizarPlan(undefined)).toBe('basico')
    expect(normalizarPlan('cualquier')).toBe('basico')
  })
})

describe('normalizarEstado', () => {
  it('acepta los cinco estados reales', () => {
    expect(normalizarEstado('prueba')).toBe('prueba')
    expect(normalizarEstado('activa')).toBe('activa')
    expect(normalizarEstado('morosa')).toBe('morosa')
    expect(normalizarEstado('suspendida')).toBe('suspendida')
    expect(normalizarEstado('baja')).toBe('baja')
  })

  it('un estado desconocido NO abre la puerta', () => {
    expect(normalizarEstado('cualquier')).toBe('suspendida')
    expect(normalizarEstado('')).toBe('suspendida')
    expect(normalizarEstado(null)).toBe('suspendida')
    expect(normalizarEstado(undefined)).toBe('suspendida')
  })
})

describe('resolverAcceso', () => {
  const NOW = Date.parse('2026-07-16T12:00:00.000Z')
  const enDias = (d: number) => new Date(NOW + d * 86_400_000).toISOString()
  const enHoras = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

  it('sin fila = acceso total (médico anterior a F4.3, no se lo deja afuera)', () => {
    expect(resolverAcceso(null, NOW)).toEqual({ acceso: 'total' })
  })

  it('activa entra sin aviso', () => {
    expect(resolverAcceso({ estado: 'activa', trialEndsAt: null }, NOW)).toEqual({ acceso: 'total' })
  })

  it('morosa entra igual, con aviso (MP sigue reintentando)', () => {
    expect(resolverAcceso({ estado: 'morosa', trialEndsAt: null }, NOW)).toEqual({
      acceso: 'aviso',
      motivo: 'morosa',
    })
  })

  it('suspendida y baja no entran', () => {
    expect(resolverAcceso({ estado: 'suspendida', trialEndsAt: null }, NOW)).toEqual({
      acceso: 'bloqueado',
      motivo: 'suspendida',
    })
    expect(resolverAcceso({ estado: 'baja', trialEndsAt: null }, NOW)).toEqual({
      acceso: 'bloqueado',
      motivo: 'baja',
    })
  })

  describe('prueba', () => {
    it('recién empezada: aviso pasivo con los días que faltan', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enDias(TRIAL_DIAS) }, NOW)).toEqual({
        acceso: 'aviso',
        motivo: 'trial_pasivo',
        diasRestantes: 14,
      })
    })

    it('a 5 días todavía es pasivo; a 4 se pone urgente (R3)', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enDias(5) }, NOW)).toMatchObject({
        motivo: 'trial_pasivo',
        diasRestantes: 5,
      })
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enDias(4) }, NOW)).toMatchObject({
        motivo: 'trial_urgente',
        diasRestantes: 4,
      })
    })

    it('en el último día es urgente, y nunca dice "0 días"', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enHoras(2) }, NOW)).toEqual({
        acceso: 'aviso',
        motivo: 'trial_urgente',
        diasRestantes: 1,
      })
    })

    it('vencida = bloqueada', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enDias(-1) }, NOW)).toEqual({
        acceso: 'bloqueado',
        motivo: 'prueba_vencida',
      })
    })

    it('vencida hace HORAS también bloquea (el ceil(-0) de alertas.ts no aplica acá)', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enHoras(-2) }, NOW)).toEqual({
        acceso: 'bloqueado',
        motivo: 'prueba_vencida',
      })
    })

    it('justo al vencer bloquea (el borde es cerrado)', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: enHoras(0) }, NOW)).toEqual({
        acceso: 'bloqueado',
        motivo: 'prueba_vencida',
      })
    })

    it('sin fecha o con fecha basura falla CERRADO', () => {
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: null }, NOW)).toEqual({
        acceso: 'bloqueado',
        motivo: 'prueba_vencida',
      })
      expect(resolverAcceso({ estado: 'prueba', trialEndsAt: 'mañana' }, NOW)).toEqual({
        acceso: 'bloqueado',
        motivo: 'prueba_vencida',
      })
    })
  })
})

describe('debeMostrarModalPrueba', () => {
  const HOY = '2026-07-16'
  const urgente = { acceso: 'aviso', motivo: 'trial_urgente', diasRestantes: 3 } as const
  const pasivo = { acceso: 'aviso', motivo: 'trial_pasivo', diasRestantes: 9 } as const

  it('en los últimos días, si todavía no lo vio hoy', () => {
    expect(debeMostrarModalPrueba(urgente, null, HOY)).toBe(true)
    expect(debeMostrarModalPrueba(urgente, '2026-07-15', HOY)).toBe(true)
  })

  it('una sola vez por día', () => {
    expect(debeMostrarModalPrueba(urgente, HOY, HOY)).toBe(false)
  })

  it('nunca cuando el aviso todavía es pasivo', () => {
    expect(debeMostrarModalPrueba(pasivo, null, HOY)).toBe(false)
  })

  it('nunca fuera de la prueba: ni al día, ni moroso, ni bloqueado', () => {
    expect(debeMostrarModalPrueba({ acceso: 'total' }, null, HOY)).toBe(false)
    expect(debeMostrarModalPrueba({ acceso: 'aviso', motivo: 'morosa' }, null, HOY)).toBe(false)
    expect(debeMostrarModalPrueba({ acceso: 'bloqueado', motivo: 'suspendida' }, null, HOY)).toBe(false)
  })
})
