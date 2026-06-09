import { describe, it, expect, beforeAll } from 'vitest'
import { cifrar, descifrar } from './encryption'

beforeAll(() => {
  // Clave fija de 32 bytes en base64 para los tests.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('encryption', () => {
  it('cifra y descifra (roundtrip)', () => {
    const secreto = 'EAAG-token-de-meta-123'
    const blob = cifrar(secreto)
    expect(blob).not.toContain(secreto) // no queda en claro
    expect(descifrar(blob)).toBe(secreto)
  })

  it('usa un nonce distinto en cada cifrado', () => {
    expect(cifrar('hola')).not.toBe(cifrar('hola'))
  })

  it('falla si el ciphertext fue manipulado', () => {
    const blob = cifrar('hola')
    const [iv, tag, data] = blob.split('.')
    const manipulado = [iv, tag, Buffer.from('otracosa').toString('base64')].join('.')
    expect(() => descifrar(manipulado)).toThrow()
  })
})
