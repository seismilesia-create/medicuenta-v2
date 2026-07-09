import { describe, it, expect } from 'vitest'
import { generarTokenInvitacion, invitacionVigente } from './token'

describe('generarTokenInvitacion', () => {
  it('genera un token url-safe de al menos 43 chars', () => {
    const t = generarTokenInvitacion()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(43)
  })

  it('genera tokens distintos en llamadas sucesivas', () => {
    const a = generarTokenInvitacion()
    const b = generarTokenInvitacion()
    expect(a).not.toBe(b)
  })
})

describe('invitacionVigente', () => {
  const ahora = new Date('2026-07-09T12:00:00.000Z')

  it('vigente si está pendiente y no venció', () => {
    expect(invitacionVigente('pendiente', '2026-07-09T13:00:00.000Z', ahora)).toBe(true)
  })

  it('no vigente si venció', () => {
    expect(invitacionVigente('pendiente', '2026-07-09T11:59:59.000Z', ahora)).toBe(false)
  })

  it('no vigente si el estado no es pendiente', () => {
    expect(invitacionVigente('completada', '2026-07-09T13:00:00.000Z', ahora)).toBe(false)
    expect(invitacionVigente('revocada', '2026-07-09T13:00:00.000Z', ahora)).toBe(false)
  })
})
