import { describe, it, expect } from 'vitest'
import { sanitizarReplyCobro } from './sanitizarReply'

const LINK_REAL = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=3461742443-abc123'
const COBRO = { link: LINK_REAL, monto: 5000 }

describe('sanitizarReplyCobro', () => {
  it('texto sin links y sin cobros → pasa tal cual', () => {
    expect(sanitizarReplyCobro('Hola, ¿me das tu nombre y DNI?', [])).toBe('Hola, ¿me das tu nombre y DNI?')
  })

  it('link INVENTADO sin cobro real → fail-closed (no sale el link trucho)', () => {
    const texto = 'Pagá acá: https://mercadopago.com.ar/checkout/v1/redirect?preference-id=75999db3-uuid-de-receta'
    const out = sanitizarReplyCobro(texto, [])
    expect(out).not.toContain('mercadopago')
    expect(out).toContain('intento de nuevo')
  })

  it('cobro real + el modelo incluyó el link real → pasa tal cual', () => {
    const texto = `Tu receta de TADALAFILO cuesta $5.000. Pagá acá: ${LINK_REAL} — apenas pagues te la mando 📄`
    expect(sanitizarReplyCobro(texto, [COBRO])).toBe(texto)
  })

  it('cobro real pero el modelo puso OTRO link → se reemplaza por el link REAL', () => {
    const texto = 'Pagá acá: https://mercadopago.com.ar/checkout/falso-inventado'
    const out = sanitizarReplyCobro(texto, [COBRO])
    expect(out).toContain(LINK_REAL)
    expect(out).not.toContain('falso-inventado')
  })

  it('cobro real pero el modelo NO puso ningún link → mensaje determinístico con el link', () => {
    const out = sanitizarReplyCobro('Listo, te generé el pago.', [COBRO])
    expect(out).toContain(LINK_REAL)
    expect(out).toContain('5.000')
  })
})
