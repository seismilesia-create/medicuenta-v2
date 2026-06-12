import { describe, it, expect } from 'vitest'
import { rutaEsFull, puedeAcceder, normalizarPlan } from './planes'

describe('rutaEsFull', () => {
  it('las rutas del consultorio son Full', () => {
    expect(rutaEsFull('/agenda')).toBe(true)
    expect(rutaEsFull('/conversaciones')).toBe(true)
    expect(rutaEsFull('/pacientes')).toBe(true)
    expect(rutaEsFull('/consultorio/config')).toBe(true)
    expect(rutaEsFull('/agenda/2026-06-12')).toBe(true)
  })

  it('las rutas de facturación NO son Full', () => {
    expect(rutaEsFull('/dashboard')).toBe(false)
    expect(rutaEsFull('/ordenes')).toBe(false)
    expect(rutaEsFull('/ordenes/nueva')).toBe(false)
    expect(rutaEsFull('/liquidaciones')).toBe(false)
    expect(rutaEsFull('/nomenclador')).toBe(false)
    expect(rutaEsFull('/asistente')).toBe(false) // asistente IA de facturación = Básico
    expect(rutaEsFull('/perfil')).toBe(false)
  })

  it('no confunde prefijos parecidos', () => {
    expect(rutaEsFull('/pacientes-otra-cosa')).toBe(false)
    expect(rutaEsFull('/agendado')).toBe(false)
  })
})

describe('puedeAcceder', () => {
  it('Full accede a todo', () => {
    expect(puedeAcceder('full', '/agenda')).toBe(true)
    expect(puedeAcceder('full', '/dashboard')).toBe(true)
  })

  it('Básico accede a facturación pero NO al consultorio', () => {
    expect(puedeAcceder('basico', '/dashboard')).toBe(true)
    expect(puedeAcceder('basico', '/ordenes')).toBe(true)
    expect(puedeAcceder('basico', '/agenda')).toBe(false)
    expect(puedeAcceder('basico', '/consultorio/config')).toBe(false)
  })
})

describe('normalizarPlan', () => {
  it('solo "full" es full; el resto (incluido null) es básico', () => {
    expect(normalizarPlan('full')).toBe('full')
    expect(normalizarPlan('basico')).toBe('basico')
    expect(normalizarPlan(null)).toBe('basico')
    expect(normalizarPlan(undefined)).toBe('basico')
    expect(normalizarPlan('cualquier')).toBe('basico')
  })
})
