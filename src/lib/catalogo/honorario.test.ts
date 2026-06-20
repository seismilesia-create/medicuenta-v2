import { describe, it, expect } from 'vitest'
import { calcularHonorarioConsulta, type ArancelVigente } from './honorario'

const arancel = (over: Partial<ArancelVigente> = {}): ArancelVigente => ({
  valor_consulta_medica: 30000,
  valor_especialista: 25000,
  valor_consulta_oftalmologica: 36000,
  valor_recertificado: 38000,
  recargo_interior_pct: null,
  ...over,
})

describe('calcularHonorarioConsulta', () => {
  it('comun → valor_consulta_medica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'comun', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(30000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('especialista → valor_especialista', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'especialista', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(25000)
  })
  it('oftalmologica → valor_consulta_oftalmologica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'oftalmologica', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(36000)
  })
  it('recertificado=true usa valor_recertificado', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel(), categoria: 'especialista', recertificado: true, atiendeInterior: false })
    expect(r?.base).toBe(38000)
    expect(r?.columna).toBe('valor_recertificado')
  })
  it('recertificado con valor_recertificado null → cae a la columna base', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_recertificado: null }), categoria: 'especialista', recertificado: true, atiendeInterior: false })
    expect(r?.base).toBe(25000)
    expect(r?.columna).toBe('valor_especialista')
  })
  it('columna base null → cae a valor_consulta_medica', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: null }), categoria: 'especialista', recertificado: false, atiendeInterior: false })
    expect(r?.base).toBe(30000)
    expect(r?.columna).toBe('valor_consulta_medica')
  })
  it('todo null → null (campo manual)', () => {
    const r = calcularHonorarioConsulta({
      arancel: arancel({ valor_consulta_medica: null, valor_especialista: null, valor_consulta_oftalmologica: null, valor_recertificado: null }),
      categoria: 'comun', recertificado: false, atiendeInterior: false,
    })
    expect(r).toBeNull()
  })
  it('arancel null o categoria null → null', () => {
    expect(calcularHonorarioConsulta({ arancel: null, categoria: 'comun', recertificado: false, atiendeInterior: false })).toBeNull()
    expect(calcularHonorarioConsulta({ arancel: arancel(), categoria: null, recertificado: false, atiendeInterior: false })).toBeNull()
  })
  it('interior aplica recargo_interior_pct', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 10 }), categoria: 'comun', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(33000)
    expect(r?.recargoPct).toBe(10)
  })
  it('interior sin recargo (null) → sin recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: null }), categoria: 'comun', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(30000)
    expect(r?.recargoPct).toBe(0)
  })
  it('atiendeInterior=false ignora el recargo', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ recargo_interior_pct: 10 }), categoria: 'comun', recertificado: false, atiendeInterior: false })
    expect(r?.honorario).toBe(30000)
  })
  it('redondeo a 2 decimales', () => {
    const r = calcularHonorarioConsulta({ arancel: arancel({ valor_especialista: 25316.62, recargo_interior_pct: 10 }), categoria: 'especialista', recertificado: false, atiendeInterior: true })
    expect(r?.honorario).toBe(27848.28)
  })
})
