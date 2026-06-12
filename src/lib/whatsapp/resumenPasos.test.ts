import { describe, it, expect } from 'vitest'
import { resumirPasosAgente, type PasoAgente } from './resumenPasos'

function paso(toolResults: { toolName: string; output?: unknown }[]): PasoAgente {
  return {
    toolCalls: toolResults.map((t) => ({ toolName: t.toolName })),
    toolResults,
  }
}

describe('resumirPasosAgente', () => {
  it('cuenta pasos y lista las tools con su resultado', () => {
    const r = resumirPasosAgente(
      [
        paso([{ toolName: 'consultar_disponibilidad', output: { dias: [] } }]),
        paso([{ toolName: 'reservar_turno', output: { ok: true, mensaje: 'Listo' } }]),
      ],
      'Te reservé el turno.',
    )
    expect(r.pasos).toBe(2)
    expect(r.tools).toEqual([
      { nombre: 'consultar_disponibilidad', ok: true },
      { nombre: 'reservar_turno', ok: true },
    ])
    expect(r.texto).toBe('Te reservé el turno.')
  })

  it('marca ok=false cuando la tool devuelve ok:false o error', () => {
    const r = resumirPasosAgente(
      [
        paso([{ toolName: 'reservar_turno', output: { ok: false, error: 'se ocupó' } }]),
        paso([{ toolName: 'buscar_receta_paciente', output: { error: 'no existe' } }]),
      ],
      '',
    )
    expect(r.tools).toEqual([
      { nombre: 'reservar_turno', ok: false },
      { nombre: 'buscar_receta_paciente', ok: false },
    ])
  })

  it('cuenta los cobros reales (cobrar_receta con link)', () => {
    const r = resumirPasosAgente(
      [
        paso([{ toolName: 'cobrar_receta', output: { link: 'https://mp/abc', monto: 5000 } }]),
        paso([{ toolName: 'cobrar_receta', output: { error: 'sin receta' } }]),
      ],
      'Acá tenés el link.',
    )
    expect(r.cobros).toBe(1)
  })

  it('un turno sin tools (solo texto) queda con tools vacío', () => {
    const r = resumirPasosAgente([paso([])], 'Hola, ¿en qué te ayudo?')
    expect(r.pasos).toBe(1)
    expect(r.tools).toEqual([])
    expect(r.cobros).toBe(0)
  })

  it('trunca el texto largo a 200 caracteres con elipsis', () => {
    const largo = 'a'.repeat(250)
    const r = resumirPasosAgente([paso([])], largo)
    expect(r.texto).toHaveLength(201) // 200 + '…'
    expect(r.texto.endsWith('…')).toBe(true)
  })

  it('tolera output ausente o no-objeto (cuenta como ok)', () => {
    const r = resumirPasosAgente([paso([{ toolName: 'avisar_consultorio' }])], '')
    expect(r.tools).toEqual([{ nombre: 'avisar_consultorio', ok: true }])
  })
})
