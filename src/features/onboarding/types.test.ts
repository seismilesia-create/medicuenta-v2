import { describe, it, expect } from 'vitest'
import { altaMedicoSchema } from './types'

const base = {
  nombre: 'Juan', apellido: 'Moreno', especialidad: 'Cardiología',
  matricula: '1234', cuit: '20-12345678-9', telefono: '3834000000',
  email: 'Juan.Moreno@Mail.com', numeroWhatsapp: '+54 9 383 400 0000',
  password: 'medico2026', passwordConfirm: 'medico2026',
}

describe('altaMedicoSchema', () => {
  it('acepta un alta válida y normaliza el email a minúsculas', () => {
    const r = altaMedicoSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.email).toBe('juan.moreno@mail.com')
  })

  it('rechaza contraseña débil (menos de 8 o sin número)', () => {
    expect(altaMedicoSchema.safeParse({ ...base, password: 'corta1', passwordConfirm: 'corta1' }).success).toBe(false)
    expect(altaMedicoSchema.safeParse({ ...base, password: 'solotexto', passwordConfirm: 'solotexto' }).success).toBe(false)
  })

  it('rechaza si password y passwordConfirm no coinciden', () => {
    expect(altaMedicoSchema.safeParse({ ...base, passwordConfirm: 'otra12345' }).success).toBe(false)
  })

  it('rechaza email inválido', () => {
    expect(altaMedicoSchema.safeParse({ ...base, email: 'no-es-email' }).success).toBe(false)
  })

  it('rechaza número de WhatsApp con menos de 10 dígitos', () => {
    expect(altaMedicoSchema.safeParse({ ...base, numeroWhatsapp: '12345' }).success).toBe(false)
  })

  it('rechaza nombre o apellido vacío', () => {
    expect(altaMedicoSchema.safeParse({ ...base, nombre: '' }).success).toBe(false)
    expect(altaMedicoSchema.safeParse({ ...base, apellido: '  ' }).success).toBe(false)
  })
})
