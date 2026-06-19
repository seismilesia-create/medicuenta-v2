import { describe, it, expect } from 'vitest'
import { catalogoVigente, estaSuspendida, type ArancelOsRow } from './obras-sociales'

const row = (over: Partial<ArancelOsRow> = {}): ArancelOsRow => ({
  codigo_os: 327, nombre_os: 'O.S.E.P.', activa: true, vigencia: '2026-02-01', ...over,
})

describe('catalogoVigente', () => {
  it('deja una entrada por codigo_os, con la vigencia más reciente', () => {
    const cat = catalogoVigente([
      row({ codigo_os: 327, nombre_os: 'O.S.E.P.', vigencia: '2026-01-01', activa: false }),
      row({ codigo_os: 327, nombre_os: 'O.S.E.P.', vigencia: '2026-02-01', activa: true }),
      row({ codigo_os: 183, nombre_os: 'GALENO', vigencia: '2026-02-01', activa: true }),
    ])
    expect(cat).toHaveLength(2)
    const osep = cat.find((o) => o.codigo_os === 327)!
    expect(osep.activa).toBe(true) // ganó la vigencia 2026-02-01
  })
  it('ordena por nombre_os', () => {
    const cat = catalogoVigente([row({ codigo_os: 183, nombre_os: 'GALENO' }), row({ codigo_os: 327, nombre_os: 'O.S.E.P.' })])
    expect(cat.map((o) => o.nombre_os)).toEqual(['GALENO', 'O.S.E.P.'])
  })
})

describe('estaSuspendida', () => {
  const catalogo = [
    { codigo_os: 327, nombre_os: 'O.S.E.P.', activa: true },
    { codigo_os: 999, nombre_os: 'OSPACA', activa: false },
  ]
  it('OS activa → no suspendida', () => {
    expect(estaSuspendida({ codigoOs: 327, obraSocial: 'O.S.E.P.', catalogo, suspendidasMedico: [] })).toBe(false)
  })
  it('OS marcada inactiva en el catálogo → suspendida (por codigo)', () => {
    expect(estaSuspendida({ codigoOs: 999, obraSocial: 'OSPACA', catalogo, suspendidasMedico: [] })).toBe(true)
  })
  it('match por nombre tolerante cuando no hay codigo', () => {
    expect(estaSuspendida({ codigoOs: null, obraSocial: 'ospaca', catalogo, suspendidasMedico: [] })).toBe(true)
  })
  it('suspendida por la lista propia del médico', () => {
    expect(estaSuspendida({ codigoOs: 327, obraSocial: 'O.S.E.P.', catalogo, suspendidasMedico: ['OSEP'] })).toBe(true)
  })
  it('particular / vacío → nunca suspendida', () => {
    expect(estaSuspendida({ codigoOs: null, obraSocial: 'particular', catalogo, suspendidasMedico: ['particular'] })).toBe(false)
    expect(estaSuspendida({ codigoOs: null, obraSocial: '', catalogo, suspendidasMedico: [] })).toBe(false)
  })
})
