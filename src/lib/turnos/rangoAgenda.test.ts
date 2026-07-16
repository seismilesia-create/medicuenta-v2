import { describe, it, expect } from 'vitest'
import { resolverRangoAgenda, DIAS_DEFAULT } from './rangoAgenda'

// Jueves 16 de julio de 2026, 12:08 hora AR — el instante real del E2E que encontró el bug.
const AHORA = new Date('2026-07-16T12:08:00-03:00').getTime()

const ok = (r: ReturnType<typeof resolverRangoAgenda>) => {
  if ('error' in r) throw new Error(`esperaba rango, vino error: ${r.error}`)
  return r
}

describe('resolverRangoAgenda', () => {
  it('sin argumentos: desde ahora hasta el fin del día AR de hoy + 14', () => {
    const r = ok(resolverRangoAgenda(undefined, AHORA))
    expect(r.desdeISO).toBe(new Date(AHORA).toISOString())
    // 2026-07-16 + 14 = 2026-07-30, 23:59 AR = 2026-07-31T02:59:00.000Z
    expect(r.hastaISO).toBe('2026-07-31T02:59:00.000Z')
    expect(r.descriptor).toBe(`los próximos ${DIAS_DEFAULT} días`)
  })

  it('día único: cubre el día ENTERO (regresión del E2E: el turno de las 18:20 debe entrar)', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-23', hasta: '2026-07-23' }, AHORA))
    expect(r.desdeISO).toBe('2026-07-23T03:00:00.000Z') // 00:00 AR
    expect(r.hastaISO).toBe('2026-07-24T02:59:00.000Z') // 23:59 AR
    const turno1820 = new Date('2026-07-23T18:20:00-03:00').getTime()
    expect(turno1820).toBeGreaterThan(new Date(r.desdeISO).getTime())
    expect(turno1820).toBeLessThanOrEqual(new Date(r.hastaISO).getTime())
    expect(r.descriptor).toBe('el jueves 23 de julio')
  })

  it('NO usa ventana rodante: pidiendo HOY al mediodía, el techo es 23:59 de hoy', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-16', hasta: '2026-07-16' }, AHORA))
    expect(r.hastaISO).toBe('2026-07-17T02:59:00.000Z') // 23:59 AR de hoy, NO mediodía+24h
  })

  it('solo desde: 14 días desde esa fecha', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-20' }, AHORA))
    expect(r.desdeISO).toBe('2026-07-20T03:00:00.000Z')
    // 2026-07-20 + 14 = 2026-08-03, 23:59 AR
    expect(r.hastaISO).toBe('2026-08-04T02:59:00.000Z')
  })

  it('solo hasta: piso = ahora', () => {
    const r = ok(resolverRangoAgenda({ hasta: '2026-07-26' }, AHORA))
    expect(r.desdeISO).toBe(new Date(AHORA).toISOString())
    expect(r.hastaISO).toBe('2026-07-27T02:59:00.000Z')
  })

  it('rango de varios días: descriptor con los dos extremos', () => {
    const r = ok(resolverRangoAgenda({ desde: '2026-07-20', hasta: '2026-07-26' }, AHORA))
    expect(r.descriptor).toBe('del lunes 20 de julio al domingo 26 de julio')
  })

  it('fecha con formato inválido → error', () => {
    const r = resolverRangoAgenda({ desde: 'mañana' }, AHORA)
    expect(r).toHaveProperty('error')
  })

  it('fecha inexistente → error (anti-rollover)', () => {
    const r = resolverRangoAgenda({ desde: '2026-02-30' }, AHORA)
    expect(r).toHaveProperty('error')
  })

  it('hasta anterior a desde → error', () => {
    const r = resolverRangoAgenda({ desde: '2026-07-26', hasta: '2026-07-20' }, AHORA)
    expect(r).toHaveProperty('error')
  })
})
