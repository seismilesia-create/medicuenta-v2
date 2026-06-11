import { describe, it, expect } from 'vitest'
import { mergeTelefonos } from './pacientes'

describe('mergeTelefonos', () => {
  it('agrega un teléfono nuevo al final', () => {
    expect(mergeTelefonos(['543834222049'], '543834551234')).toEqual(['543834222049', '543834551234'])
  })
  it('no duplica', () => {
    expect(mergeTelefonos(['543834222049'], '543834222049')).toEqual(['543834222049'])
  })
  it('ignora vacío/null y tolera base no-array (jsonb roto)', () => {
    expect(mergeTelefonos(['543834222049'], '')).toEqual(['543834222049'])
    expect(mergeTelefonos(['543834222049'], null)).toEqual(['543834222049'])
    expect(mergeTelefonos(null, '543834222049')).toEqual(['543834222049'])
    expect(mergeTelefonos('basura' as unknown, '543834222049')).toEqual(['543834222049'])
  })
  it('filtra elementos no-string de la base', () => {
    expect(mergeTelefonos(['543834222049', 7 as unknown as string], '543834551234')).toEqual([
      '543834222049',
      '543834551234',
    ])
  })
})
