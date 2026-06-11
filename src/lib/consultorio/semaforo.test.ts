import { describe, it, expect } from 'vitest'
import { VENTANA_24H_MS, ventanaAbierta, msRestantesVentana, semaforoConversacion } from './semaforo'

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime()
const HACE_1H = new Date(NOW - 3_600_000).toISOString()
const HACE_25H = new Date(NOW - 25 * 3_600_000).toISOString()

describe('ventanaAbierta', () => {
  it('abierta si el paciente escribió hace menos de 24 h', () => {
    expect(ventanaAbierta(HACE_1H, NOW)).toBe(true)
  })
  it('cerrada pasadas las 24 h, sin dato, o con fecha rota', () => {
    expect(ventanaAbierta(HACE_25H, NOW)).toBe(false)
    expect(ventanaAbierta(null, NOW)).toBe(false)
    expect(ventanaAbierta('no-es-fecha', NOW)).toBe(false)
  })
  it('borde exacto de 24 h → cerrada', () => {
    expect(ventanaAbierta(new Date(NOW - VENTANA_24H_MS).toISOString(), NOW)).toBe(false)
  })
})

describe('msRestantesVentana', () => {
  it('devuelve cuánto falta para que cierre', () => {
    expect(msRestantesVentana(HACE_1H, NOW)).toBe(VENTANA_24H_MS - 3_600_000)
  })
  it('cerrada o sin dato → 0', () => {
    expect(msRestantesVentana(HACE_25H, NOW)).toBe(0)
    expect(msRestantesVentana(null, NOW)).toBe(0)
  })
})

describe('semaforoConversacion', () => {
  it('necesita_humano gana siempre → alerta', () => {
    expect(semaforoConversacion({ necesita_humano: true, last_paciente_at: HACE_25H }, NOW)).toBe('alerta')
  })
  it('ventana abierta → viva', () => {
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: HACE_1H }, NOW)).toBe('viva')
  })
  it('ventana cerrada → terminada (vuelve a viva sola cuando el paciente escriba)', () => {
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: HACE_25H }, NOW)).toBe('terminada')
    expect(semaforoConversacion({ necesita_humano: false, last_paciente_at: null }, NOW)).toBe('terminada')
  })
})
