import { describe, it, expect } from 'vitest'
import { esRemitenteMedico } from './clasificar'

describe('esRemitenteMedico', () => {
  it('reconoce al médico aunque difiera el "9" argentino', () => {
    // entrante con 9, número personal cargado sin 9
    expect(esRemitenteMedico('5493834111222', '543834111222')).toBe(true)
  })
  it('reconoce al médico con formato idéntico', () => {
    expect(esRemitenteMedico('5493834111222', '5493834111222')).toBe(true)
  })
  it('un paciente NO es el médico', () => {
    expect(esRemitenteMedico('5493834999888', '543834111222')).toBe(false)
  })
})
