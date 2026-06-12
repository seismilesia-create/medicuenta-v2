/**
 * Presentación de la bitácora (spec Fase 3 §10): traduce cada registro técnico
 * de `wa_bitacora` a un título + resumen legibles para el médico. Pura y
 * decidible (sin DB) → testeable. La UI solo pinta lo que esto devuelve.
 */

export interface RegistroBitacora {
  origen: string // 'agente' | 'panel' | 'webhook' | 'gcal' | 'mp'
  nivel: 'info' | 'error'
  evento: string
  detalle: Record<string, unknown>
}

export interface VistaEvento {
  titulo: string
  resumen: string
}

/** Nombres técnicos de tools → algo que el médico entienda. */
const TOOL_LABELS: Record<string, string> = {
  consultar_disponibilidad: 'consultó horarios',
  reservar_turno: 'reservó un turno',
  cancelar_turno: 'canceló un turno',
  buscar_receta_paciente: 'buscó una receta',
  cobrar_receta: 'cobró una receta',
  avisar_consultorio: 'avisó al consultorio',
}

function resumenTools(detalle: Record<string, unknown>): string {
  const tools = Array.isArray(detalle.tools) ? (detalle.tools as { nombre: string; ok: boolean }[]) : []
  if (tools.length === 0) return 'Respondió un mensaje.'
  return tools
    .map((t) => {
      const label = TOOL_LABELS[t.nombre] ?? t.nombre
      return t.ok ? label : `${label} (falló)`
    })
    .join(', ')
}

function textoError(detalle: Record<string, unknown>): string {
  const e = detalle.error
  if (typeof e === 'string' && e.trim()) return e.length > 160 ? `${e.slice(0, 160)}…` : e
  return 'Sin detalle.'
}

/** Mapea un registro a su vista humana. Cae a un texto genérico si no lo conoce. */
export function describirEvento(r: RegistroBitacora): VistaEvento {
  switch (r.evento) {
    case 'agente_turno':
      return { titulo: 'El asistente respondió', resumen: resumenTools(r.detalle) }
    case 'agente_error':
      return { titulo: 'Error del asistente', resumen: textoError(r.detalle) }
    case 'necesita_humano':
      return { titulo: 'Pidió intervención humana', resumen: 'Un paciente necesita que alguien lo atienda.' }
    case 'respuesta_humana':
      return { titulo: 'Respondiste vos', resumen: 'Respuesta enviada desde el panel.' }
    case 'respuesta_humana_error':
      return { titulo: 'No se pudo enviar tu respuesta', resumen: textoError(r.detalle) }
    case 'bot_pausado':
      return { titulo: 'Asistente en pausa', resumen: 'Tomaste el control de una conversación.' }
    case 'bot_reanudado':
      return { titulo: 'Asistente reanudado', resumen: 'El asistente volvió a responder solo.' }
    case 'aviso_os_suspendida': {
      const os = typeof r.detalle.obra_social === 'string' ? ` (${r.detalle.obra_social})` : ''
      return { titulo: 'Obra social suspendida', resumen: `El asistente avisó al reservar${os} — no bloqueó.` }
    }
    case 'ocr_receta_error':
      return { titulo: 'No se pudo leer la receta', resumen: textoError(r.detalle) }
    case 'upsert_paciente_error':
      return { titulo: 'No se pudo guardar el paciente', resumen: textoError(r.detalle) }
    default:
      return {
        titulo: r.evento.replace(/_/g, ' '),
        resumen: r.nivel === 'error' ? textoError(r.detalle) : '',
      }
  }
}
