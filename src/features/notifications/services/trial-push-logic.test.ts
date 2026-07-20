import { describe, it, expect } from 'vitest'
import { decidirPushTrial, mensajeTrial, type SubTrial } from './trial-push-logic'

const DIA = 86_400_000
const NOW = new Date('2026-07-20T12:00:00.000Z').getTime()
const enDias = (n: number) => new Date(NOW + n * DIA).toISOString() // futuro (trial_ends_at)
const haceDias = (n: number) => new Date(NOW - n * DIA).toISOString() // pasado (actividad)

// Médico ACTIVO, prueba a mitad de camino → base sin ningún push pendiente.
const base: SubTrial = {
  trialEndsAt: enDias(10),
  createdAt: haceDias(4),
  lastActiveAt: haceDias(0),
  pushReenganche: null,
  pushUrgencia: null,
}

describe('decidirPushTrial — urgencia (últimos 3 días)', () => {
  it('inactivo con ≤3 días restantes → urgencia', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(2), lastActiveAt: haceDias(3) }, NOW)).toBe('urgencia')
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(3), lastActiveAt: haceDias(2) }, NOW)).toBe('urgencia')
  })
  it('ACTIVO cerca de vencer (lo cubre el modal) → null', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(2), lastActiveAt: haceDias(0) }, NOW)).toBeNull()
  })
  it('ya enviada la urgencia → null', () => {
    expect(
      decidirPushTrial({ ...base, trialEndsAt: enDias(2), lastActiveAt: haceDias(3), pushUrgencia: haceDias(1) }, NOW),
    ).toBeNull()
  })
})

describe('decidirPushTrial — reenganche (1ª mitad)', () => {
  it('inactivo ≥4 días con ≥8 restantes → reenganche', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(9), lastActiveAt: haceDias(5) }, NOW)).toBe('reenganche')
  })
  it('sin last_active_at usa created_at (nunca volvió tras el alta) → reenganche', () => {
    expect(
      decidirPushTrial({ ...base, trialEndsAt: enDias(9), lastActiveAt: null, createdAt: haceDias(5) }, NOW),
    ).toBe('reenganche')
  })
  it('ACTIVO (inactivo <4) → null', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(9), lastActiveAt: haceDias(1) }, NOW)).toBeNull()
  })
  it('ya enviado el reenganche → null', () => {
    expect(
      decidirPushTrial({ ...base, trialEndsAt: enDias(9), lastActiveAt: haceDias(5), pushReenganche: haceDias(1) }, NOW),
    ).toBeNull()
  })
})

describe('decidirPushTrial — casos borde', () => {
  it('hueco 4-7 días (lo cubre el modal in-app) → null', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(5), lastActiveAt: haceDias(5) }, NOW)).toBeNull()
  })
  it('prueba ya vencida → null', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: enDias(-1), lastActiveAt: haceDias(5) }, NOW)).toBeNull()
  })
  it('sin trial_ends_at o fecha rota → null', () => {
    expect(decidirPushTrial({ ...base, trialEndsAt: null }, NOW)).toBeNull()
    expect(decidirPushTrial({ ...base, trialEndsAt: 'no-es-fecha', lastActiveAt: haceDias(5) }, NOW)).toBeNull()
  })
})

describe('mensajeTrial', () => {
  it('urgencia → tono directo, /plan, plural/singular', () => {
    const m = mensajeTrial('urgencia', 3)
    expect(m.body).toContain('3 días')
    expect(m.url).toBe('/plan')
    expect(mensajeTrial('urgencia', 1).body).toContain('Te queda 1 día')
  })
  it('reenganche → tono cálido, /asistente', () => {
    const m = mensajeTrial('reenganche', 9)
    expect(m.body).toContain('extrañamos')
    expect(m.body).toContain('9 días')
    expect(m.url).toBe('/asistente')
  })
})
