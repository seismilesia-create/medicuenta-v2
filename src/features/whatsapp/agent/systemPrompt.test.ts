import { describe, it, expect } from 'vitest'
import { buildSystemPromptPaciente } from './systemPrompt'

describe('buildSystemPromptPaciente — límite clínico B4', () => {
  const prompt = buildSystemPromptPaciente({ config: null })

  it('prohíbe explícitamente el contenido clínico (regla dura)', () => {
    expect(prompt).toMatch(/PROHIBIDO/)
    expect(prompt).toMatch(/dosis|posolog/i) // posología / dosis
    expect(prompt).toMatch(/acción farmacológica/i)
    expect(prompt).toMatch(/precio de un medicamento/i)
  })

  it('incluye la excepción de emergencia con el 107', () => {
    expect(prompt).toContain('107')
  })

  it('preserva los carve-outs que sostienen el negocio (no-regresión)', () => {
    // debe seguir permitiendo decir el monto de gestión de la receta
    expect(prompt).toMatch(/costo de gestión/i)
    // y nombrar el medicamento de la receta al listarla
    expect(prompt).toMatch(/nombrar el medicamento/i)
  })
})
