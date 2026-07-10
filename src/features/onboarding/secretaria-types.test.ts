import { describe, it, expect } from 'vitest'
import { altaSecretariaSchema } from './secretaria-types'

const base = {
  nombre: 'Ana',
  apellido: 'Gómez',
  password: 'secre2026',
  passwordConfirm: 'secre2026',
}

describe('altaSecretariaSchema', () => {
  it('acepta un alta válida', () => {
    const r = altaSecretariaSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('rechaza contraseña débil (menos de 8 o sin número)', () => {
    expect(altaSecretariaSchema.safeParse({ ...base, password: 'corta1', passwordConfirm: 'corta1' }).success).toBe(false)
    expect(altaSecretariaSchema.safeParse({ ...base, password: 'solotexto', passwordConfirm: 'solotexto' }).success).toBe(false)
  })

  it('rechaza si password y passwordConfirm no coinciden', () => {
    expect(altaSecretariaSchema.safeParse({ ...base, passwordConfirm: 'otra12345' }).success).toBe(false)
  })

  it('rechaza nombre o apellido vacío', () => {
    expect(altaSecretariaSchema.safeParse({ ...base, nombre: '' }).success).toBe(false)
    expect(altaSecretariaSchema.safeParse({ ...base, apellido: '  ' }).success).toBe(false)
  })
})
