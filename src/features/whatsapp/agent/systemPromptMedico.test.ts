import { describe, it, expect } from 'vitest'
import { buildSystemPromptMedico } from './systemPromptMedico'
import { DIAS_DEFAULT } from '@/lib/turnos/rangoAgenda'

describe('buildSystemPromptMedico', () => {
  const prompt = buildSystemPromptMedico({ nombreMedico: 'Juan Pérez' })

  it('es administrativo y explícitamente NO clínico', () => {
    expect(prompt).toMatch(/administrativo/i)
    expect(prompt).toMatch(/no.*cl[íi]nic/i)
  })

  it('obliga a confirmar el precio antes de fijarlo', () => {
    expect(prompt).toContain('fijar_precio_receta')
    // "Confirmá" tiene que estar LIGADO a la llamada a la tool en la misma regla,
    // no ser dos substrings sueltos: un edit que destripe el "confirmá antes" debe fallar.
    expect(prompt).toMatch(/confirm[^\n]*fijar_precio_receta/i)
  })

  it('deriva la carga pesada (órdenes/débitos/cirugías) a la app', () => {
    expect(prompt).toMatch(/órdenes/i)
    expect(prompt).toMatch(/d[ée]bitos/i)
    expect(prompt).toMatch(/cirug/i)
    // Los ítems pesados y su derivación a la app tienen que estar LIGADOS en la misma regla.
    expect(prompt).toMatch(/(órdenes|d[ée]bitos|cirug)[^\n]*(en la app|desde MediCuenta)/i)
  })

  it('incluye el nombre del médico', () => {
    expect(prompt).toContain('Juan Pérez')
  })

  it('anuncia el default REAL de consultar_agenda y que acepta rango (no un número hardcodeado que se pudra)', () => {
    expect(prompt).toContain(`próximos ${DIAS_DEFAULT} días`)
    expect(prompt).toMatch(/consultar_agenda[^\n]*desde\/hasta/i)
  })
})
