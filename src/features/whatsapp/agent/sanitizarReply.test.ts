import { describe, it, expect } from 'vitest'
import { sanitizarReplyCobro, scrubLinksMP } from './sanitizarReply'

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
    expect(out).toBe('Tuve un problema para generar el link de pago. Escribime "quiero pagar mi receta" y lo intento de nuevo 🙏')
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

  it('flujo mixto: conserva el turno confirmado y anexa el cobro real (link deformado fuera)', () => {
    const texto =
      'Tu turno quedó agendado para el martes a las 09:45. Tu receta cuesta $5000, pagá acá: https://mercadopago.com.ar/checkout/falso-inventado'
    const out = sanitizarReplyCobro(texto, [{ link: LINK_REAL, monto: 5000 }])
    expect(out).toContain('turno quedó agendado')
    expect(out).toContain(LINK_REAL)
    expect(out).not.toContain('falso-inventado')
  })

  it('texto vacío con cobro real → solo el bloque determinístico', () => {
    const out = sanitizarReplyCobro('', [{ link: LINK_REAL, monto: 5000 }])
    expect(out).toBe(`Tu receta cuesta $5.000. Pagá acá: ${LINK_REAL}\nApenas se acredite el pago te la mando por acá 📄`)
  })
})

describe('scrubLinksMP', () => {
  it('reemplaza links de MP del historial por una marca neutra', () => {
    const out = scrubLinksMP('Pagá acá: https://mercadopago.com.ar/checkout/v1/redirect?pref=xyz — gracias')
    expect(out).not.toContain('https://')
    expect(out).toContain('ya no válido')
  })
  it('no toca texto sin links', () => {
    expect(scrubLinksMP('Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?')
  })
})
