/**
 * El cerebro del orquestador v1 (spec dashboard §6): mira las señales de cada
 * médico y arma las alertas que el dueño tiene que ver. Puro y decidible (sin DB):
 * solo aplica umbrales y redacta. v1 = observa y avisa, NO actúa.
 *
 * Las señales salen de las mismas métricas del superadmin (`MedicoMetricas`).
 */
import type { MedicoMetricas } from './costos'

export type Severidad = 'error' | 'warning' | 'info'

export interface Alerta {
  tipo: 'errores' | 'pago' | 'suspendida' | 'trial' | 'whatsapp'
  severidad: Severidad
  medico: string
  mensaje: string
}

export const UMBRAL_ERRORES = 5
export const UMBRAL_ERRORES_GRAVE = 15
export const DIAS_TRIAL_AVISO = 3
const DIA_MS = 86_400_000

function nombreMedico(m: MedicoMetricas): string {
  const n = [m.nombre, m.apellido].filter(Boolean).join(' ').trim()
  return n || m.email || 'Médico'
}

const PESO: Record<Severidad, number> = { error: 0, warning: 1, info: 2 }

export function detectarAlertas(medicos: MedicoMetricas[], nowMs: number): Alerta[] {
  const alertas: Alerta[] = []

  for (const m of medicos) {
    const medico = nombreMedico(m)

    // Errores recientes
    if (m.errores_7d >= UMBRAL_ERRORES) {
      alertas.push({
        tipo: 'errores',
        severidad: m.errores_7d >= UMBRAL_ERRORES_GRAVE ? 'error' : 'warning',
        medico,
        mensaje: `${m.errores_7d} errores en los últimos 7 días — revisar la bitácora`,
      })
    }

    // Estado de la suscripción
    if (m.sub_estado === 'morosa') {
      alertas.push({ tipo: 'pago', severidad: 'error', medico, mensaje: 'Pago pendiente (moroso)' })
    } else if (m.sub_estado === 'suspendida') {
      alertas.push({ tipo: 'suspendida', severidad: 'warning', medico, mensaje: 'Suscripción suspendida' })
    }

    // Prueba por vencer / vencida
    if (m.sub_estado === 'prueba' && m.trial_ends_at) {
      const dias = Math.ceil((new Date(m.trial_ends_at).getTime() - nowMs) / DIA_MS)
      if (dias < 0) {
        alertas.push({ tipo: 'trial', severidad: 'warning', medico, mensaje: 'Prueba vencida — definir si pasa a pago' })
      } else if (dias <= DIAS_TRIAL_AVISO) {
        alertas.push({
          tipo: 'trial',
          severidad: 'info',
          medico,
          mensaje: dias === 0 ? 'La prueba vence hoy' : `La prueba vence en ${dias} día${dias === 1 ? '' : 's'}`,
        })
      }
    }

    // WhatsApp desconectado (solo aplica a Full, que es quien lo usa)
    if (m.plan === 'full' && m.canal_estado && m.canal_estado !== 'conectado') {
      alertas.push({ tipo: 'whatsapp', severidad: 'warning', medico, mensaje: `WhatsApp ${m.canal_estado}` })
    }
  }

  // Lo más grave primero.
  return alertas.sort((a, b) => PESO[a.severidad] - PESO[b.severidad])
}
