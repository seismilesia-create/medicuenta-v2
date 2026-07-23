import { describe, it, expect } from 'vitest'
import { componerMensajeOrdenPresencial } from './ordenPresencial'

const HORARIOS = 'Lun, Mié y Vie de 09:00 a 13:00'
const LUGARES = '• Sanatorio Pasteur (consultorio 54, 1er piso) — Lun, Mié y Vie'

const completo = (over: Partial<Parameters<typeof componerMensajeOrdenPresencial>[0]> = {}) =>
  componerMensajeOrdenPresencial({
    horariosTexto: HORARIOS,
    lugaresTexto: LUGARES,
    secretariaDisponible: false,
    ...over,
  })

describe('componerMensajeOrdenPresencial', () => {
  it('dice que el trámite es presencial y que hay que firmar la orden', () => {
    const msg = completo()
    expect(msg).toContain('presencial')
    expect(msg).toContain('firmás')
  })

  it('aclara qué hacer con una orden emitida en otro lado', () => {
    expect(completo()).toContain('no para atenderte')
  })

  it('promete el PDF por el mismo chat y ofrece la vía de pago como alternativa', () => {
    const msg = completo()
    expect(msg).toContain('por este mismo chat')
    expect(msg).toContain('pagar')
  })

  it('nunca deriva a chatear con la secretaria', () => {
    expect(completo()).not.toContain('te va a atender la secretaria por')
  })

  it('incluye horarios y lugares cuando están cargados', () => {
    const msg = completo()
    expect(msg).toContain(HORARIOS)
    expect(msg).toContain(LUGARES)
  })

  it('omite la sección de lugares si el médico no cargó ninguno', () => {
    const msg = completo({ lugaresTexto: null })
    expect(msg).not.toContain('📍')
    expect(msg).toContain(HORARIOS)
  })

  it('omite el horario si no hay horarios cargados, sin inventar uno', () => {
    const msg = completo({ horariosTexto: null })
    expect(msg).not.toContain('🕐')
    expect(msg).toContain('en el horario de atención')
  })

  it('sin horarios ni lugares sigue explicando el trámite', () => {
    const msg = completo({ horariosTexto: null, lugaresTexto: null })
    expect(msg).toContain('presencial')
    expect(msg).toContain('orden de consulta')
  })

  it('avisa cuando la secretaria está atendiendo en este momento', () => {
    expect(completo({ secretariaDisponible: true })).toContain('atendiendo ahora')
    expect(completo({ secretariaDisponible: false })).not.toContain('atendiendo ahora')
  })

  it('no contiene links: el sanitizador de cobro borraría un link no generado por tools', () => {
    expect(completo()).not.toMatch(/https?:\/\//)
  })
})
