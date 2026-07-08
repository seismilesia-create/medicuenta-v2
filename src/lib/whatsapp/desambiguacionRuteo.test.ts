import { describe, it, expect } from 'vitest'
import {
  normalizarNombre, matchApellido, etiquetaMedico,
  interpretarConfirmacion, interpretarSeleccion, sesionVencida, RUTEO_TTL_MS,
  type MedicoNodo,
} from './desambiguacionRuteo'

const morenoJ: MedicoNodo = { medicoId: 'm1', nombre: 'Juan', apellido: 'Moreno', especialidad: 'Traumatología', matricula: '1735' }
const morenoA: MedicoNodo = { medicoId: 'm2', nombre: 'Ana', apellido: 'Moreno', especialidad: 'Clínica', matricula: '1900' }
const perez:   MedicoNodo = { medicoId: 'm3', nombre: 'Luis', apellido: 'Pérez', especialidad: null, matricula: '2100' }
const TODOS = [morenoJ, morenoA, perez]

describe('normalizarNombre', () => {
  it('minúsculas, sin acentos, sin espacios de más', () => {
    expect(normalizarNombre('  Pérez  ')).toBe('perez')
    expect(normalizarNombre('MORENO')).toBe('moreno')
  })
})

describe('matchApellido', () => {
  it('un apellido único → 1 candidato', () => {
    expect(matchApellido('perez', TODOS).map((m) => m.medicoId)).toEqual(['m3'])
  })
  it('apellido con acento sin tipearlo → matchea', () => {
    expect(matchApellido('Perez', TODOS).map((m) => m.medicoId)).toEqual(['m3'])
  })
  it('apellido compartido → varios candidatos', () => {
    expect(matchApellido('moreno', TODOS).map((m) => m.medicoId)).toEqual(['m1', 'm2'])
  })
  it('acepta "dr moreno" (ignora prefijo)', () => {
    expect(matchApellido('dr moreno', TODOS).map((m) => m.medicoId)).toEqual(['m1', 'm2'])
  })
  it('sin coincidencia → vacío', () => {
    expect(matchApellido('gomez', TODOS)).toEqual([])
  })
  it('texto vacío → vacío (no matchea todo)', () => {
    expect(matchApellido('   ', TODOS)).toEqual([])
  })
})

describe('etiquetaMedico', () => {
  it('con especialidad', () => {
    expect(etiquetaMedico(morenoJ)).toBe('Moreno, Juan — Traumatología')
  })
  it('sin especialidad usa matrícula', () => {
    expect(etiquetaMedico(perez)).toBe('Pérez, Luis (Mat. 2100)')
  })
})

describe('interpretarConfirmacion', () => {
  it('sí / mismo / dale → si', () => {
    for (const t of ['sí', 'si', 'Dale', 'mismo', 'SIGO', 'ese']) expect(interpretarConfirmacion(t)).toBe('si')
  })
  it('no / otro / diferente → no', () => {
    for (const t of ['no', 'otro', 'Otra', 'diferente', 'cambiar']) expect(interpretarConfirmacion(t)).toBe('no')
  })
  it('cualquier otra cosa → ambiguo', () => {
    expect(interpretarConfirmacion('necesito una receta')).toBe('ambiguo')
  })
  it('"es otro médico" → no (no lo confunde con sí)', () => {
    expect(interpretarConfirmacion('es otro médico')).toBe('no')
  })
})

describe('interpretarSeleccion', () => {
  const cands = [morenoJ, morenoA]
  it('por número (1-based)', () => {
    expect(interpretarSeleccion('2', cands)?.medicoId).toBe('m2')
  })
  it('número fuera de rango → null', () => {
    expect(interpretarSeleccion('5', cands)).toBeNull()
  })
  it('por nombre si desambigua a 1 entre los candidatos', () => {
    expect(interpretarSeleccion('ana', cands)?.medicoId).toBe('m2')
  })
  it('texto que no resuelve → null', () => {
    expect(interpretarSeleccion('cualquiera', cands)).toBeNull()
  })
})

describe('sesionVencida', () => {
  it('dentro del TTL → false', () => {
    const t0 = '2026-07-08T10:00:00.000Z'
    const now = Date.parse('2026-07-08T13:00:00.000Z') // 3 h después
    expect(sesionVencida(t0, now, RUTEO_TTL_MS)).toBe(false)
  })
  it('pasado el TTL → true', () => {
    const t0 = '2026-07-08T10:00:00.000Z'
    const now = Date.parse('2026-07-08T15:00:00.000Z') // 5 h después
    expect(sesionVencida(t0, now, RUTEO_TTL_MS)).toBe(true)
  })
})
