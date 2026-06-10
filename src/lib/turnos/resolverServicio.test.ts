import { describe, it, expect } from 'vitest'
import { resolverServicio, type ServicioLite } from './resolverServicio'

const consulta: ServicioLite = { id: 'a1', nombre: 'Consulta', duracion_min: 30, precio: null, activo: true }
const control: ServicioLite = { id: 'b2', nombre: 'Control post-operatorio', duracion_min: 15, precio: null, activo: true }
const inactivo: ServicioLite = { id: 'c3', nombre: 'Ecografía', duracion_min: 20, precio: null, activo: false }

describe('resolverServicio', () => {
  it('sin servicios activos → ninguno', () => {
    expect(resolverServicio([inactivo], 'consulta')).toEqual({ tipo: 'ninguno' })
    expect(resolverServicio([], '')).toEqual({ tipo: 'ninguno' })
  })

  it("query vacía + UN solo activo → ese (el caso típico: 'Consulta')", () => {
    expect(resolverServicio([consulta, inactivo], '')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('query vacía + varios activos → pedir elección', () => {
    const r = resolverServicio([consulta, control], '')
    expect(r.tipo).toBe('elegir')
    if (r.tipo === 'elegir') expect(r.opciones).toHaveLength(2)
  })

  it('match exacto (case-insensitive)', () => {
    expect(resolverServicio([consulta, control], 'CONSULTA')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('match parcial en ambas direcciones', () => {
    expect(resolverServicio([consulta, control], 'control')).toEqual({ tipo: 'ok', servicio: control })
    expect(resolverServicio([consulta, control], 'quiero un control post-operatorio ya')).toEqual({
      tipo: 'ok',
      servicio: control,
    })
  })

  it('query sin match + UN solo activo → ese (el médico ofrece una sola cosa)', () => {
    expect(resolverServicio([consulta], 'turno para lo que sea')).toEqual({ tipo: 'ok', servicio: consulta })
  })

  it('query sin match + varios activos → pedir elección', () => {
    const r = resolverServicio([consulta, control], 'masajes')
    expect(r.tipo).toBe('elegir')
  })
})
