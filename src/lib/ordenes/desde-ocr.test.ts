import { describe, expect, it } from 'vitest'
import { mergeOcrEnOrden, ordenDesdeOcr } from './desde-ocr'
import type { OrdenExtraida } from '@/lib/ai/ocr-orden'

function ocrBase(over: Partial<OrdenExtraida> = {}): OrdenExtraida {
  return {
    es_orden_medica: true,
    motivo_rechazo: '',
    delegacion: '',
    titulo_autorizacion: 'COMPROBANTE AUTORIZACIÓN',
    nro_comprobante: '12345678',
    nro_internacion: '',
    fecha_solicitud: '',
    fecha_vencimiento: '',
    fecha_prescripcion: '',
    fecha_emision: '2026-07-23',
    hora_emision: '10:15',
    titular_nombre: 'PÉREZ JUAN',
    medico_solicitante: '',
    grupo_afiliado: '01',
    nro_afiliado: '445566',
    paciente: 'PÉREZ ANA',
    cobertura: 'COBERTURA GENERAL',
    parentesco: '00',
    domicilio: '',
    tipo_documento: 'DNI',
    nro_documento: '30111222',
    obra_social: 'OSEP',
    codigo_practica: '01-420101-01',
    alias: '',
    nombre_practica: 'CONSULTA MÉDICA',
    cantidad: 1,
    cara: '',
    pieza: '',
    importe: 0,
    forma_pago: 'Contado',
    cod_pago: '',
    origen: 'Prestador',
    diagnostico: '',
    arancelista: 'PASTEUREREYES',
    cajero: '',
    total_cargo_afiliado: 0,
    fecha_realizacion: '2026-07-23',
    horario_realizacion: '10:00',
    matricula_profesional: '1735',
    profesional: 'GÓMEZ CARLOS',
    entidad: 'SANATORIO PASTEUR S.A.',
    responsable: 'CIRCULO MEDICO DE CATAMARCA',
    agente_facturador: 'circulo_medico',
    token_osep: '112233',
    firma_paciente: true,
    firma_sello_medico: false,
    observaciones: '',
    no_encontrados: [],
    campos_dudosos: [],
    confianza: 'alta',
    ...over,
  } as OrdenExtraida
}

describe('ordenDesdeOcr', () => {
  it('mapea los campos del OCR a columnas, con "" → null', () => {
    const p = ordenDesdeOcr(ocrBase())
    expect(p.nro_comprobante).toBe('12345678')
    expect(p.token_osep).toBe('112233')
    expect(p.delegacion).toBeNull()
    expect(p.diagnostico_cie10).toBeNull()
    expect(p.firma_paciente).toBe(true)
    expect(p.agente_facturador).toBe('circulo_medico')
  })

  it('cantidad 0 del OCR cae a 1 y total 0 a null', () => {
    const p = ordenDesdeOcr(ocrBase({ cantidad: 0, total_cargo_afiliado: 0 }))
    expect(p.cantidad).toBe(1)
    expect(p.total_cargo_afiliado).toBeNull()
  })

  it('sin agente_facturador inferido no pisa el default', () => {
    const p = ordenDesdeOcr(ocrBase({ agente_facturador: '' }))
    expect('agente_facturador' in p).toBe(false)
  })
})

describe('mergeOcrEnOrden (lote "sin foto")', () => {
  it('solo completa los campos vacíos: lo tipeado no se pisa', () => {
    const orden = { nro_comprobante: '999', token_osep: null, nro_afiliado: '', honorario_calculado: 0 }
    const merge = mergeOcrEnOrden(orden, ordenDesdeOcr(ocrBase()))
    expect(merge.nro_comprobante).toBeUndefined() // tipeado: intacto
    expect(merge.token_osep).toBe('112233') // vacío: completa
    expect(merge.nro_afiliado).toBe('445566')
  })

  it('jamás toca identidad/estado de negocio', () => {
    const merge = mergeOcrEnOrden(
      { estado: 'borrador', medico_id: null, monto_plus: 0 },
      { ...ordenDesdeOcr(ocrBase()), estado: 'presentada', medico_id: 'x', monto_plus: 9999 },
    )
    expect(merge.estado).toBeUndefined()
    expect(merge.medico_id).toBeUndefined()
    expect(merge.monto_plus).toBeUndefined()
  })

  it('firma en false se completa si el OCR la ve en true, nunca al revés', () => {
    const merge = mergeOcrEnOrden({ firma_paciente: false, firma_sello_medico: true }, ordenDesdeOcr(ocrBase()))
    expect(merge.firma_paciente).toBe(true)
    expect(merge.firma_sello_medico).toBeUndefined() // OCR dice false: no degrada
  })
})
