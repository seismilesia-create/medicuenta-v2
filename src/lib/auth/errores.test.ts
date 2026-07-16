import { describe, expect, it } from 'vitest'
import { traducirErrorAuth } from './errores'

describe('traducirErrorAuth', () => {
  it('traduce credenciales inválidas (el caso de login)', () => {
    expect(traducirErrorAuth('Invalid login credentials')).toBe('Correo o contraseña incorrectos.')
  })

  it('traduce la contraseña débil de leaked-password protection', () => {
    expect(
      traducirErrorAuth('Password is known to be weak and easy to guess, please choose a different one.'),
    ).toBe('Esa contraseña es demasiado común o insegura. Elegí una diferente.')
  })

  it('es case-insensitive y tolera espacios', () => {
    expect(traducirErrorAuth('  INVALID LOGIN CREDENTIALS  ')).toBe('Correo o contraseña incorrectos.')
  })

  it('traduce email no confirmado', () => {
    expect(traducirErrorAuth('Email not confirmed')).toMatch(/confirmar tu correo/)
  })

  it('traduce usuario ya registrado', () => {
    expect(traducirErrorAuth('User already registered')).toBe('Ya existe una cuenta con ese correo.')
  })

  it('captura rate limit por patrón (mensaje con tiempo variable)', () => {
    expect(traducirErrorAuth('For security purposes, you can only request this after 41 seconds.')).toMatch(
      /Demasiados intentos/,
    )
  })

  it('captura variantes de contraseña débil por patrón', () => {
    expect(traducirErrorAuth('This password has been pwned')).toMatch(/común o insegura/)
  })

  it('cae a genérico en español ante mensaje desconocido (nunca deja texto en inglés)', () => {
    const out = traducirErrorAuth('Some brand new GoTrue error we have never seen')
    expect(out).toBe('No se pudo completar la operación. Intentá de nuevo.')
  })

  it('cae a genérico ante vacío/null', () => {
    expect(traducirErrorAuth('')).toBe('No se pudo completar la operación. Intentá de nuevo.')
    expect(traducirErrorAuth(null)).toBe('No se pudo completar la operación. Intentá de nuevo.')
    expect(traducirErrorAuth(undefined)).toBe('No se pudo completar la operación. Intentá de nuevo.')
  })
})
