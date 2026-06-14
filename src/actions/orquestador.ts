'use server'

import { resolverSuperadmin } from '@/features/admin/access/superadmin'
import { procesarYEnviarDigest, type MotivoNoEnvio } from '@/lib/admin/orquestadorEnvio'

const MENSAJE: Record<MotivoNoEnvio, string> = {
  'sin-alertas': 'El orquestador no detectó problemas. No hay nada que avisar. 👌',
  'sin-cambios': 'Sin novedades desde el último aviso — no se reenvió.',
  'sin-destinatario': 'Falta configurar el email de destino (ORQUESTADOR_EMAIL_TO).',
  'error-email': 'No se pudo enviar el email (revisá RESEND_API_KEY).',
}

/**
 * Botón "Enviar resumen ahora" del panel del dueño. Fuerza el envío (sin dedup)
 * para que Héctor pueda probar sin esperar al cron. Solo el superadmin.
 */
export async function enviarDigestAhora(): Promise<{ ok: boolean; mensaje: string }> {
  const sa = await resolverSuperadmin()
  if (!sa) return { ok: false, mensaje: 'No autorizado' }

  const r = await procesarYEnviarDigest({ forzar: true })
  if (r.enviado) {
    return { ok: true, mensaje: `Resumen enviado (${r.cantidad} alerta${r.cantidad === 1 ? '' : 's'}).` }
  }
  return { ok: false, mensaje: r.motivo ? MENSAJE[r.motivo] : 'No se pudo enviar.' }
}
