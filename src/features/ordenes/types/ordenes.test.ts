import { describe, it, expect } from 'vitest'
import { esEstadoOrden, transicionOrdenPermitida } from './ordenes'

describe('esEstadoOrden', () => {
  it('acepta los 4 estados válidos', () => {
    expect(esEstadoOrden('borrador')).toBe(true)
    expect(esEstadoOrden('presentada')).toBe(true)
    expect(esEstadoOrden('aprobada')).toBe(true)
    expect(esEstadoOrden('debitada')).toBe(true)
  })
  it('rechaza cualquier otro string', () => {
    expect(esEstadoOrden('foo')).toBe(false)
    expect(esEstadoOrden('')).toBe(false)
    expect(esEstadoOrden('BORRADOR')).toBe(false)
  })
})

describe('transicionOrdenPermitida', () => {
  it('borrador solo puede ir a presentada', () => {
    expect(transicionOrdenPermitida('borrador', 'presentada')).toBe(true)
    expect(transicionOrdenPermitida('borrador', 'aprobada')).toBe(false)
    expect(transicionOrdenPermitida('borrador', 'debitada')).toBe(false)
  })
  it('presentada cicla a aprobada/debitada pero NO vuelve a borrador (snapshot)', () => {
    expect(transicionOrdenPermitida('presentada', 'aprobada')).toBe(true)
    expect(transicionOrdenPermitida('presentada', 'debitada')).toBe(true)
    expect(transicionOrdenPermitida('presentada', 'borrador')).toBe(false)
  })
  it('aprobada/debitada se corrigen entre sí y vuelven a presentada, nunca a borrador', () => {
    expect(transicionOrdenPermitida('aprobada', 'debitada')).toBe(true)
    expect(transicionOrdenPermitida('aprobada', 'presentada')).toBe(true)
    expect(transicionOrdenPermitida('debitada', 'aprobada')).toBe(true)
    expect(transicionOrdenPermitida('debitada', 'presentada')).toBe(true)
    expect(transicionOrdenPermitida('aprobada', 'borrador')).toBe(false)
    expect(transicionOrdenPermitida('debitada', 'borrador')).toBe(false)
  })
  it('misma → misma es no-op permitido', () => {
    expect(transicionOrdenPermitida('presentada', 'presentada')).toBe(true)
    expect(transicionOrdenPermitida('borrador', 'borrador')).toBe(true)
  })
})
