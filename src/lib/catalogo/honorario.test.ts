import { describe, it, expect } from 'vitest'
import { calcularHonorarioConsulta, type ArancelVigente } from './honorario'

// Fixture con los 4 tiers en orden creciente realista (médica < especialista < oftalmo < oftalmo-recert).
const arancel = (over: Partial<ArancelVigente> = {}): ArancelVigente => ({
  valor_consulta_medica: 27000, // tier 'medica'
  valor_especialista: 34000, // tier 'especialista' (= especialista recertificado)
  valor_consulta_oftalmologica: 39000, // tier 'oftalmologica'
  valor_recertificado: 42000, // tier 'oftalmologica_recertificado'
  recargo_interior_pct: null,
  ...over,
})

describe('calcularHonorarioConsulta', () => {
  it('medica → valor_consulta_medica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'medica', atiendeInterior: false })
    expect(r?.base).toBe(27000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('especialista → valor_especialista', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'especialista', atiendeInterior: false })
    expect(r?.base).toBe(34000)
    expect(r?.columna).toBe('valor_especialista')
  })
  it('oftalmologica → valor_consulta_oftalmologica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'oftalmologica', atiendeInterior: false })
    expect(r?.base).toBe(39000)
    expect(r?.columna).toBe('valor_consulta_oftalmologica')
  })
  it('oftalmologica_recertificado → valor_recertificado', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'oftalmologica_recertificado', atiendeInterior: false })
    expect(r?.base).toBe(42000)
    expect(r?.columna).toBe('valor_recertificado')
  })
  it('especialista con su columna null → cae a consulta médica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: null }), categoria: 'especialista', atiendeInterior: false })
    expect(r?.base).toBe(27000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('oftalmologica_recertificado con recert null → cae a oftalmológica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_recertificado: null }), categoria: 'oftalmologica_recertificado', atiendeInterior: false })
    expect(r?.base).toBe(39000)
    expect(r?.columna).toBe('valor_consulta_oftalmologica')
  })
  it('oftalmologica_recertificado con recert+oftalmo null → cae a consulta médica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_recertificado: null, valor_consulta_oftalmologica: null }), categoria: 'oftalmologica_recertificado', atiendeInterior: false })
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('médica null → null (sin cálculo, campo manual)', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_consulta_medica: null }), categoria: 'medica', atiendeInterior: false })
    expect(r).toBeNull()
  })
  it('valor 0 se trata como null (cae al siguiente candidato)', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: 0 }), categoria: 'especialista', atiendeInterior: false })
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('arancel null o categoria null → null', () => {
    expect(calcularHonorarioConsulta({ arancel: null, categoria: 'medica', atiendeInterior: false })).toBeNull()
    expect(calcularHonorarioConsulta({ arancel: arancel(), categoria: null, atiendeInterior: false })).toBeNull()
  })
  it('interior aplica recargo_interior_pct (OSEP +20%)', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 20 }), categoria: 'medica', atiendeInterior: true })
    expect(r?.honorario).toBe(32400) // 27000 * 1.20
    expect(r?.recargoPct).toBe(20)
  })
  it('interior sin recargo (null) → sin recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: null }), categoria: 'medica', atiendeInterior: true })
    expect(r?.honorario).toBe(27000)
    expect(r?.recargoPct).toBe(0)
  })
  it('atiendeInterior=false ignora el recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 20 }), categoria: 'medica', atiendeInterior: false })
    expect(r?.honorario).toBe(27000)
  })
  it('redondeo a 2 decimales', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: 25316.62, recargo_interior_pct: 20 }), categoria: 'especialista', atiendeInterior: true })
    expect(r?.honorario).toBe(30379.94) // 25316.62 * 1.20 = 30379.944
  })
})
