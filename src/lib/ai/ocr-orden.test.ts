import { describe, it, expect } from 'vitest'
import {
  ordenExtraidaSchema,
  CAMPOS_NUCLEO,
  NUCLEO_LABELS,
  OCR_ORDEN_PROMPT,
  OCR_ORDEN_PROMPT_VERSION,
} from './ocr-orden'

describe('ordenExtraidaSchema — núcleo genérico', () => {
  it('CAMPOS_NUCLEO tiene las 11 claves de texto/número del núcleo', () => {
    expect([...CAMPOS_NUCLEO].sort()).toEqual(
      [
        'cobertura',
        'codigo_practica',
        'diagnostico',
        'fecha_emision',
        'fecha_realizacion',
        'nombre_practica',
        'nro_afiliado',
        'nro_comprobante',
        'nro_documento',
        'obra_social',
        'paciente',
      ].sort(),
    )
  })

  it('cada campo del núcleo tiene label en español', () => {
    for (const campo of CAMPOS_NUCLEO) {
      expect(NUCLEO_LABELS[campo]).toBeTruthy()
    }
  })

  it('parsea una respuesta con no_encontrados poblado', () => {
    const parsed = ordenExtraidaSchema.parse({
      es_orden_medica: true,
      motivo_rechazo: '',
      delegacion: '', titulo_autorizacion: '', nro_comprobante: '12345678',
      nro_internacion: '', fecha_solicitud: '', fecha_vencimiento: '',
      fecha_prescripcion: '', fecha_emision: '2026-07-01', hora_emision: '',
      titular_nombre: 'PEREZ JUAN', medico_solicitante: '', grupo_afiliado: '01',
      nro_afiliado: '033883', paciente: 'PEREZ JUAN', cobertura: '', parentesco: '',
      domicilio: '', tipo_documento: 'DNI', nro_documento: '',
      obra_social: 'SWISS MEDICAL', codigo_practica: '', alias: '',
      nombre_practica: 'CONSULTA', cantidad: 1, cara: '', pieza: '', importe: 0,
      forma_pago: '', cod_pago: '', origen: '', diagnostico: '', arancelista: '',
      cajero: '', total_cargo_afiliado: 0, fecha_realizacion: '2026-07-01',
      horario_realizacion: '', matricula_profesional: '', profesional: '',
      entidad: '', responsable: '', agente_facturador: '', token_osep: '',
      firma_paciente: false, firma_sello_medico: false, observaciones: '',
      confianza: 'media', campos_dudosos: [],
      no_encontrados: ['nro_documento', 'cobertura'],
    })
    expect(parsed.no_encontrados).toEqual(['nro_documento', 'cobertura'])
  })

  it('el prompt es agnóstico de OS (no hardcodea "OSEP")', () => {
    expect(OCR_ORDEN_PROMPT.toLowerCase()).toContain('cualquier obra social')
    expect(OCR_ORDEN_PROMPT_VERSION).toBeTruthy()
  })
})
