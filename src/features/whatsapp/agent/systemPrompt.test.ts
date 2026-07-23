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

describe('buildSystemPromptPaciente — orden de consulta presencial', () => {
  const prompt = buildSystemPromptPaciente({ config: null })

  it('presenta la vía obra social como trámite presencial', () => {
    expect(prompt).toContain('PRESENCIAL')
    expect(prompt).toContain('solicitar_orden_consulta')
  })

  it('ya no deriva al paciente a chatear con la secretaria', () => {
    expect(prompt).not.toMatch(/secretaria lo va a atender por el chat/i)
    expect(prompt).not.toMatch(/fuera del horario de la secretaria/i)
  })

  it('prohíbe inventar horarios y direcciones', () => {
    expect(prompt).toMatch(/NUNCA inventes horarios, direcciones/i)
  })
})

describe('buildSystemPromptPaciente — lugares de atención', () => {
  it('inyecta los lugares cargados para responder dónde atiende', () => {
    const prompt = buildSystemPromptPaciente({
      config: null,
      lugares: 'Sanatorio Pasteur, consultorio 54 (Lun, Mié y Vie)',
    })
    expect(prompt).toContain('DÓNDE ATIENDE')
    expect(prompt).toContain('Sanatorio Pasteur, consultorio 54 (Lun, Mié y Vie)')
  })

  it('sin lugares cargados manda a avisar al consultorio en vez de inventar una dirección', () => {
    const prompt = buildSystemPromptPaciente({ config: null })
    expect(prompt).not.toContain('DÓNDE ATIENDE')
    expect(prompt).toMatch(/no tenés cargada la dirección/i)
    expect(prompt).toMatch(/No inventes direcciones/i)
  })
})
