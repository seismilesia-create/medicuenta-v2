import { describe, it, expect } from 'vitest'
import { normalizarUsage } from './usoIa'

describe('normalizarUsage', () => {
  it('usa totalTokens cuando viene', () => {
    expect(normalizarUsage({ inputTokens: 100, outputTokens: 40, totalTokens: 140 })).toEqual({
      input: 100,
      output: 40,
      total: 140,
    })
  })

  it('suma input+output si falta totalTokens', () => {
    expect(normalizarUsage({ inputTokens: 100, outputTokens: 40 })).toEqual({
      input: 100,
      output: 40,
      total: 140,
    })
  })

  it('campos ausentes → 0', () => {
    expect(normalizarUsage({})).toEqual({ input: 0, output: 0, total: 0 })
    expect(normalizarUsage(undefined)).toEqual({ input: 0, output: 0, total: 0 })
    expect(normalizarUsage(null)).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('redondea y nunca devuelve negativos', () => {
    expect(normalizarUsage({ inputTokens: 10.7, outputTokens: -5, totalTokens: 12.2 })).toEqual({
      input: 11,
      output: 0,
      total: 12,
    })
  })
})
