import { describe, it, expect } from 'vitest'
import {
  formatearLugar,
  listaLugaresTexto,
  lugaresDelDia,
  resumenLugaresLinea,
  type LugarAtencion,
} from './lugaresAtencion'

const lugar = (over: Partial<LugarAtencion> = {}): LugarAtencion => ({
  id: 'x',
  nombre: 'Sanatorio Pasteur',
  direccion: null,
  consultorio: null,
  piso: null,
  dias: [],
  ...over,
})

describe('formatearLugar', () => {
  it('arma nombre, dirección, consultorio, piso y días', () => {
    expect(
      formatearLugar(lugar({ direccion: 'República 764', consultorio: '2', piso: '1er piso', dias: [4] })),
    ).toBe('Sanatorio Pasteur, República 764 (consultorio 2, 1er piso) — Jue')
  })

  it('omite los datos opcionales que faltan', () => {
    expect(formatearLugar(lugar({ consultorio: '12', dias: [2] }))).toBe('Sanatorio Pasteur (consultorio 12) — Mar')
  })

  it('sin días no agrega el sufijo', () => {
    expect(formatearLugar(lugar())).toBe('Sanatorio Pasteur')
  })
})

describe('listaLugaresTexto', () => {
  it('arma un bullet por lugar', () => {
    const texto = listaLugaresTexto([
      lugar({ consultorio: '54', piso: '1er piso', dias: [1, 3, 5] }),
      lugar({ nombre: 'Sanatorio San Javier', consultorio: '12', dias: [2] }),
    ])
    expect(texto).toBe(
      '• Sanatorio Pasteur (consultorio 54, 1er piso) — Lun, Mié y Vie\n• Sanatorio San Javier (consultorio 12) — Mar',
    )
  })

  it('lista los dos lugares del mismo día sin elegir uno', () => {
    const texto = listaLugaresTexto([
      lugar({ nombre: 'Pasteur', dias: [1] }),
      lugar({ nombre: 'San Javier', dias: [1] }),
    ])
    expect(texto).toContain('Pasteur')
    expect(texto).toContain('San Javier')
  })

  it('sin lugares devuelve vacío', () => {
    expect(listaLugaresTexto([])).toBe('')
  })
})

describe('resumenLugaresLinea', () => {
  it('junta todo en una línea con separador ·', () => {
    expect(
      resumenLugaresLinea([
        lugar({ consultorio: '54', piso: '1er piso', dias: [1, 3, 5] }),
        lugar({ nombre: 'Consultorio privado', direccion: 'República 764', consultorio: '2', dias: [4] }),
      ]),
    ).toBe(
      'Sanatorio Pasteur, consultorio 54, 1er piso (Lun, Mié y Vie) · Consultorio privado, República 764, consultorio 2 (Jue)',
    )
  })

  it('sin lugares devuelve vacío', () => {
    expect(resumenLugaresLinea([])).toBe('')
  })
})

describe('lugaresDelDia', () => {
  it('filtra por el día de semana de la fecha en hora AR', () => {
    // 2026-07-23 es jueves (weekday 4) en Argentina.
    const lugares = [lugar({ nombre: 'Pasteur', dias: [1, 3, 5] }), lugar({ nombre: 'Privado', dias: [4] })]
    expect(lugaresDelDia(lugares, '2026-07-23').map((l) => l.nombre)).toEqual(['Privado'])
  })
})
