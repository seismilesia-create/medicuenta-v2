import { describe, it, expect } from 'vitest'
import { describirEvento, type RegistroBitacora } from './bitacora'

function reg(over: Partial<RegistroBitacora>): RegistroBitacora {
  return { origen: 'agente', nivel: 'info', evento: 'agente_turno', detalle: {}, ...over }
}

describe('describirEvento', () => {
  it('agente_turno: traduce las tools a lenguaje humano', () => {
    const v = describirEvento(
      reg({
        evento: 'agente_turno',
        detalle: { tools: [{ nombre: 'reservar_turno', ok: true }, { nombre: 'cobrar_receta', ok: true }] },
      }),
    )
    expect(v.titulo).toBe('El asistente respondió')
    expect(v.resumen).toBe('reservó un turno, cobró una receta')
  })

  it('agente_turno: marca la tool que falló', () => {
    const v = describirEvento(
      reg({ detalle: { tools: [{ nombre: 'reservar_turno', ok: false }] } }),
    )
    expect(v.resumen).toBe('reservó un turno (falló)')
  })

  it('agente_turno sin tools: respondió un mensaje', () => {
    expect(describirEvento(reg({ detalle: { tools: [] } })).resumen).toBe('Respondió un mensaje.')
  })

  it('agente_error: muestra el texto del error (truncado)', () => {
    const v = describirEvento(reg({ nivel: 'error', evento: 'agente_error', detalle: { error: 'boom' } }))
    expect(v.titulo).toBe('Error del asistente')
    expect(v.resumen).toBe('boom')
  })

  it('agente_error largo se trunca', () => {
    const v = describirEvento(reg({ evento: 'agente_error', detalle: { error: 'x'.repeat(200) } }))
    expect(v.resumen.endsWith('…')).toBe(true)
    expect(v.resumen.length).toBe(161)
  })

  it('eventos conocidos del panel', () => {
    expect(describirEvento(reg({ evento: 'bot_pausado' })).titulo).toBe('Asistente en pausa')
    expect(describirEvento(reg({ evento: 'necesita_humano' })).titulo).toBe('Pidió intervención humana')
    expect(describirEvento(reg({ evento: 'respuesta_humana' })).titulo).toBe('Respondiste vos')
  })

  it('aviso_os_suspendida: nombra la obra social del detalle', () => {
    const v = describirEvento(reg({ evento: 'aviso_os_suspendida', detalle: { obra_social: 'OSEP' } }))
    expect(v.titulo).toBe('Obra social suspendida')
    expect(v.resumen).toContain('OSEP')
  })

  it('ocr_receta_error: error de lectura de receta', () => {
    const v = describirEvento(reg({ nivel: 'error', evento: 'ocr_receta_error', detalle: { error: 'pdf ilegible' } }))
    expect(v.titulo).toBe('No se pudo leer la receta')
    expect(v.resumen).toBe('pdf ilegible')
  })

  it('evento desconocido: título legible y, si es error, su detalle', () => {
    const v = describirEvento(reg({ nivel: 'error', evento: 'algo_raro', detalle: { error: 'detalle' } }))
    expect(v.titulo).toBe('algo raro')
    expect(v.resumen).toBe('detalle')
  })
})
