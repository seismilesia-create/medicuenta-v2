import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMetaSignature } from './signature'

const APP_SECRET = 'app-secret-de-prueba'
const body = '{"object":"whatsapp_business_account"}'
const firmaValida = 'sha256=' + createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')

describe('verifyMetaSignature', () => {
  it('acepta una firma válida', () => {
    expect(verifyMetaSignature(body, firmaValida, APP_SECRET)).toBe(true)
  })
  it('rechaza una firma inválida', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', APP_SECRET)).toBe(false)
  })
  it('rechaza si falta el header', () => {
    expect(verifyMetaSignature(body, null, APP_SECRET)).toBe(false)
  })
  it('rechaza si el body fue alterado', () => {
    expect(verifyMetaSignature(body + ' ', firmaValida, APP_SECRET)).toBe(false)
  })
})
