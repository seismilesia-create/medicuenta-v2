/**
 * Orquestador v1b — decide y entrega (spec §6). Junta los efectos: lee las
 * métricas cross-tenant, detecta alertas (puro), arma el digest (puro), aplica el
 * dedup por cambio contra `orquestador_avisos` y, si corresponde, manda el email.
 *
 * La lógica pura vive en `alertas.ts` y `digest.ts`; acá solo se orquesta.
 * Server-only: usa service-role. Lo llaman el cron y el botón "Enviar ahora".
 */
import { createServiceClient } from '@/lib/supabase/server'
import { getMedicosConMetricas } from '@/features/admin/services/superadminService'
import { detectarAlertas } from './alertas'
import { construirDigest } from './digest'
import { sendEmail } from '@/lib/email/resend'

type Service = ReturnType<typeof createServiceClient>

export type MotivoNoEnvio = 'sin-alertas' | 'sin-cambios' | 'sin-destinatario' | 'error-email'

export interface ResultadoEnvio {
  enviado: boolean
  motivo?: MotivoNoEnvio
  cantidad: number
}

/**
 * Destinatario del digest: `ORQUESTADOR_EMAIL_TO` si está; si no, el email del
 * perfil marcado `es_superadmin` (vía auth.admin, que solo puede el service-role).
 */
async function resolverDestinatario(service: Service): Promise<string | null> {
  const fijo = process.env.ORQUESTADOR_EMAIL_TO?.trim()
  if (fijo) return fijo

  const { data: perfil } = await service
    .from('perfiles')
    .select('id')
    .eq('es_superadmin', true)
    .limit(1)
    .maybeSingle()
  if (!perfil?.id) return null

  const { data } = await service.auth.admin.getUserById(perfil.id as string)
  return data?.user?.email ?? null
}

export async function procesarYEnviarDigest(
  { forzar = false }: { forzar?: boolean } = {},
): Promise<ResultadoEnvio> {
  const { medicos } = await getMedicosConMetricas()
  const alertas = detectarAlertas(medicos, Date.now())
  const digest = construirDigest(alertas)

  // v1b solo avisa cuando hay algo. Sin alertas = silencio (no spamea).
  if (!digest.hayAlertas) return { enviado: false, motivo: 'sin-alertas', cantidad: 0 }

  const service = createServiceClient()

  // Dedup por cambio: si el set es idéntico al último aviso, no reenvía.
  // El botón "Enviar ahora" pasa `forzar` para saltarse esto al probar.
  if (!forzar) {
    const { data: ultimo } = await service
      .from('orquestador_avisos')
      .select('firma')
      .order('enviado_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimo?.firma === digest.firma) {
      return { enviado: false, motivo: 'sin-cambios', cantidad: digest.cantidad }
    }
  }

  const destinatario = await resolverDestinatario(service)
  if (!destinatario) return { enviado: false, motivo: 'sin-destinatario', cantidad: digest.cantidad }

  const ok = await sendEmail({
    to: destinatario,
    subject: digest.asunto,
    html: digest.html,
    text: digest.texto,
  })
  if (!ok) return { enviado: false, motivo: 'error-email', cantidad: digest.cantidad }

  // Registramos lo enviado (bitácora + base del dedup de la próxima corrida).
  await service.from('orquestador_avisos').insert({
    firma: digest.firma,
    cantidad: digest.cantidad,
    payload: alertas,
  })

  return { enviado: true, cantidad: digest.cantidad }
}
