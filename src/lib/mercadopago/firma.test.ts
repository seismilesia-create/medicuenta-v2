import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { parseXSignature, buildManifest, validarFirma } from './firma'

const SECRET = 'un-secreto-de-prueba'
const firmar = (manifest: string) => createHmac('sha256', SECRET).update(manifest).digest('hex')

describe('parseXSignature', () => {
  it('saca ts y v1', () => {
    expect(parseXSignature('ts=1704908010,v1=618c8534')).toEqual({ ts: '1704908010', v1: '618c8534' })
  })

  it('tolera espacios y el orden invertido', () => {
    expect(parseXSignature(' v1=abc , ts=123 ')).toEqual({ ts: '123', v1: 'abc' })
  })

  it('null si falta una parte o viene rota', () => {
    expect(parseXSignature('ts=123')).toBeNull()
    expect(parseXSignature('v1=abc')).toBeNull()
    expect(parseXSignature('cualquier cosa')).toBeNull()
    expect(parseXSignature(null)).toBeNull()
    expect(parseXSignature('')).toBeNull()
  })
})

describe('buildManifest', () => {
  it('el formato exacto que firma MP, con el ; final', () => {
    expect(buildManifest({ dataId: 'abc123', requestId: 'req-1', ts: '999' })).toBe(
      'id:abc123;request-id:req-1;ts:999;',
    )
  })

  it('pasa data.id a minusculas', () => {
    // En los pagos el id es numerico y da igual; en preapproval es alfanumerico y
    // sin el lowercase la firma NUNCA valida.
    expect(buildManifest({ dataId: 'ABC123', requestId: 'r', ts: '1' })).toBe('id:abc123;request-id:r;ts:1;')
  })

  it('si falta data.id o request-id, el trozo se ELIMINA (no queda vacio)', () => {
    expect(buildManifest({ dataId: null, requestId: 'r', ts: '1' })).toBe('request-id:r;ts:1;')
    expect(buildManifest({ dataId: 'a', requestId: null, ts: '1' })).toBe('id:a;ts:1;')
    expect(buildManifest({ ts: '1' })).toBe('ts:1;')
  })
})

describe('validarFirma', () => {
  const base = { xRequestId: 'req-1', dataId: 'abc123', secret: SECRET }
  const bueno = firmar('id:abc123;request-id:req-1;ts:999;')

  it('acepta una firma legitima', () => {
    expect(validarFirma({ ...base, xSignature: `ts=999,v1=${bueno}` })).toBe(true)
  })

  it('rechaza si cambia CUALQUIER parte del manifest', () => {
    // Cada uno de estos es un intento de hacer pasar un evento ajeno por propio.
    expect(validarFirma({ ...base, xSignature: `ts=1000,v1=${bueno}` })).toBe(false)
    expect(validarFirma({ ...base, dataId: 'otro', xSignature: `ts=999,v1=${bueno}` })).toBe(false)
    expect(validarFirma({ ...base, xRequestId: 'otro', xSignature: `ts=999,v1=${bueno}` })).toBe(false)
  })

  it('rechaza una firma con otro secreto', () => {
    const ajeno = createHmac('sha256', 'otro-secreto').update('id:abc123;request-id:req-1;ts:999;').digest('hex')
    expect(validarFirma({ ...base, xSignature: `ts=999,v1=${ajeno}` })).toBe(false)
  })

  it('rechaza basura y firmas de largo distinto sin romper', () => {
    expect(validarFirma({ ...base, xSignature: 'ts=999,v1=corta' })).toBe(false)
    expect(validarFirma({ ...base, xSignature: null })).toBe(false)
    expect(validarFirma({ ...base, xSignature: '' })).toBe(false)
  })

  it('SIN secreto configurado rechaza todo, no acepta todo', () => {
    // Falla cerrado a proposito: un webhook que no valida es peor que uno que no anda,
    // porque el segundo se nota.
    expect(validarFirma({ ...base, secret: undefined, xSignature: `ts=999,v1=${bueno}` })).toBe(false)
    expect(validarFirma({ ...base, secret: '', xSignature: `ts=999,v1=${bueno}` })).toBe(false)
  })

  it('valida tambien cuando MP no manda data.id', () => {
    const sinData = firmar('request-id:req-1;ts:999;')
    expect(validarFirma({ ...base, dataId: null, xSignature: `ts=999,v1=${sinData}` })).toBe(true)
  })
})
