import type { OrdenExtraida } from '@/lib/ai/ocr-orden'

// Mapper puro OCR → columnas de `ordenes`. Es la misma correspondencia que usa
// NuevaOrdenForm al prellenar el form, pero directa (el check-in guarda sin
// pasar por un formulario). Los "" del OCR se normalizan a null.

const texto = (s: string | undefined) => {
  const t = s?.trim()
  return t ? t : null
}

/** Campos de la orden que salen del OCR (sin identidad de negocio: tipo/estado/medico van aparte). */
export function ordenDesdeOcr(ocr: OrdenExtraida): Record<string, unknown> {
  return {
    delegacion: texto(ocr.delegacion),
    titulo_autorizacion: texto(ocr.titulo_autorizacion),
    nro_comprobante: texto(ocr.nro_comprobante),
    nro_internacion: texto(ocr.nro_internacion),
    fecha_solicitud: texto(ocr.fecha_solicitud),
    fecha_vencimiento: texto(ocr.fecha_vencimiento),
    fecha_prescripcion: texto(ocr.fecha_prescripcion),
    fecha_emision: texto(ocr.fecha_emision),
    hora_emision: texto(ocr.hora_emision),
    titular_nombre: texto(ocr.titular_nombre),
    medico_solicitante: texto(ocr.medico_solicitante),
    grupo_afiliado: texto(ocr.grupo_afiliado),
    nro_afiliado: texto(ocr.nro_afiliado),
    cobertura: texto(ocr.cobertura),
    parentesco: texto(ocr.parentesco),
    domicilio: texto(ocr.domicilio),
    tipo_documento: texto(ocr.tipo_documento),
    nro_documento: texto(ocr.nro_documento),
    codigo_practica: texto(ocr.codigo_practica),
    alias: texto(ocr.alias),
    nombre_practica: texto(ocr.nombre_practica),
    cantidad: ocr.cantidad > 0 ? ocr.cantidad : 1,
    cara: texto(ocr.cara),
    pieza: texto(ocr.pieza),
    forma_pago: texto(ocr.forma_pago),
    cod_pago: texto(ocr.cod_pago),
    origen: texto(ocr.origen),
    diagnostico_cie10: texto(ocr.diagnostico),
    arancelista: texto(ocr.arancelista),
    cajero: texto(ocr.cajero),
    total_cargo_afiliado: ocr.total_cargo_afiliado > 0 ? ocr.total_cargo_afiliado : null,
    horario_realizacion: texto(ocr.horario_realizacion),
    matricula_profesional: texto(ocr.matricula_profesional),
    profesional: texto(ocr.profesional),
    entidad: texto(ocr.entidad),
    responsable: texto(ocr.responsable),
    token_osep: texto(ocr.token_osep),
    firma_paciente: ocr.firma_paciente,
    firma_sello_medico: ocr.firma_sello_medico,
    observaciones: texto(ocr.observaciones),
    ...(ocr.agente_facturador ? { agente_facturador: ocr.agente_facturador } : {}),
  }
}

// Campos que el merge del lote NUNCA pisa: identidad y estado de negocio.
const NO_MERGEABLES = new Set([
  'id',
  'medico_id',
  'tipo',
  'estado',
  'nivel',
  'turno_id',
  'presentacion_id',
  'registrada_por',
  'imagen_comprobante',
  'datos_ocr',
  'monto_plus',
  'monto_particular',
  'agente_facturador',
])

/**
 * Merge del lote "órdenes sin foto": del payload OCR, SOLO los campos que la
 * orden tiene vacíos (null/''/0). Lo tipeado en el mostrador no se pisa jamás.
 */
export function mergeOcrEnOrden(
  ordenActual: Record<string, unknown>,
  payloadOcr: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payloadOcr)) {
    if (NO_MERGEABLES.has(k)) continue
    if (v === null || v === undefined || v === '') continue
    const actual = ordenActual[k]
    const vacio =
      actual === null ||
      actual === undefined ||
      actual === '' ||
      (typeof actual === 'number' && actual === 0) ||
      (typeof actual === 'boolean' && actual === false && typeof v === 'boolean' && v === true)
    if (vacio) out[k] = v
  }
  return out
}
