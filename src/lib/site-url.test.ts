import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { siteUrl } from './site-url'

const CLAVES = ['PUBLIC_BASE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const

describe('siteUrl', () => {
  let previo: Record<string, string | undefined>

  beforeEach(() => {
    previo = Object.fromEntries(CLAVES.map((k) => [k, process.env[k]]))
    for (const k of CLAVES) delete process.env[k]
  })
  afterEach(() => {
    for (const k of CLAVES) {
      if (previo[k] === undefined) delete process.env[k]
      else process.env[k] = previo[k]
    }
  })

  it('prefiere PUBLIC_BASE_URL sobre todo', () => {
    process.env.PUBLIC_BASE_URL = 'https://medicuenta-v2.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'otra.vercel.app'
    process.env.VERCEL_URL = 'deploy-abc.vercel.app'
    expect(siteUrl()).toBe('https://medicuenta-v2.vercel.app')
  })

  it('cae a VERCEL_PROJECT_PRODUCTION_URL (host pelado → https) si falta PUBLIC_BASE_URL', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'medicuenta-v2.vercel.app'
    process.env.VERCEL_URL = 'deploy-abc.vercel.app'
    expect(siteUrl()).toBe('https://medicuenta-v2.vercel.app')
  })

  it('cae a VERCEL_URL si solo esa está (deploy de preview sin las otras)', () => {
    process.env.VERCEL_URL = 'medicuenta-v2-git-preview.vercel.app'
    expect(siteUrl()).toBe('https://medicuenta-v2-git-preview.vercel.app')
  })

  it('cae a localhost en desarrollo local (ninguna env de Vercel)', () => {
    expect(siteUrl()).toBe('http://localhost:3000')
  })

  it('no duplica el protocolo si VERCEL_* ya lo trae', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'https://medicuenta-v2.vercel.app'
    expect(siteUrl()).toBe('https://medicuenta-v2.vercel.app')
  })

  it('quita la barra final para que `${siteUrl()}/c/x` no genere doble barra', () => {
    process.env.PUBLIC_BASE_URL = 'https://medicuenta-v2.vercel.app/'
    expect(siteUrl()).toBe('https://medicuenta-v2.vercel.app')
  })
})
