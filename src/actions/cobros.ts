'use server'

import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { buildPreferenciaBodyCobro, crearPreferencia } from '@/lib/mercadopago/client'
import {
  generarLinkCobroSchema,
  type EstadoCobro,
  type GenerarLinkCobroInput,
  type MedioCobro,
} from '@/features/cobros/types/cobros'
import {
  actualizarPendiente,
  anularCobro as anularCobroService,
  crearCobro,
  getCobroById,
} from '@/features/cobros/services/cobrosService'

// Actions del MÉDICO sobre su propio ledger (la RLS de `cobros` y
// `mp_conexiones` alcanza con su sesión). El check-in de la secretaria y el bot
// tienen sus propias actions service-role (Fases B y C).

const uuidSchema = z.string().uuid()

/**
 * Genera (o regenera, si viene cobroId pendiente) el link de pago MP de un
 * cobro de consultorio. El webhook ?cobro= acredita solo.
 */
export async function generarLinkCobro(
  input: GenerarLinkCobroInput,
): Promise<{ cobroId: string; link: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const parsed = generarLinkCobroSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const baseUrl = process.env.PUBLIC_BASE_URL
  if (!baseUrl) return { error: 'Falta configurar PUBLIC_BASE_URL' }

  const conexion = await getConexionActiva(supabase, user.id)
  if (!conexion) {
    return { error: 'Conectá tu cuenta de MercadoPago desde Configuración para cobrar con link.' }
  }

  let cobroId: string
  if (data.cobroId) {
    // Regenerar: solo sobre un cobro MP aún pendiente (el monto pudo cambiar).
    const cobro = await getCobroById(supabase, user.id, data.cobroId)
    if (!cobro || cobro.estado !== 'pendiente' || cobro.medio !== 'mercadopago') {
      return { error: 'Ese cobro ya no admite regenerar el link.' }
    }
    if (Number(cobro.monto) !== data.monto) {
      const ok = await actualizarPendiente(supabase, user.id, cobro.id, { monto: data.monto })
      if (!ok) return { error: 'No se pudo actualizar el monto del cobro.' }
    }
    cobroId = cobro.id
  } else {
    const cobro = await crearCobro(supabase, {
      medicoId: user.id,
      concepto: data.concepto,
      monto: data.monto,
      medio: 'mercadopago',
      estado: 'pendiente',
      turnoId: data.turnoId ?? null,
      pacienteNombre: data.pacienteNombre ?? null,
      registradoPor: user.id,
    })
    if (!cobro) return { error: 'No se pudo registrar el cobro.' }
    cobroId = cobro.id
  }

  const body = buildPreferenciaBodyCobro(
    {
      cobroId,
      titulo: data.concepto === 'consulta_particular' ? 'Consulta particular' : 'Plus de consulta',
      monto: data.monto,
      notificationUrl: `${baseUrl}/api/mercadopago/webhook?cobro=${cobroId}`,
    },
    new Date(),
  )
  const pref = await crearPreferencia(conexion.accessToken, body)
  if (!pref) {
    // Sin link no hay cobro: si recién nació, se anula para no dejar pendientes basura.
    if (!data.cobroId) await anularCobroService(supabase, user.id, cobroId)
    return { error: 'MercadoPago no pudo generar el link. Probá de nuevo.' }
  }
  await actualizarPendiente(supabase, user.id, cobroId, { mpPreferenceId: pref.id })

  return { cobroId, link: pref.initPoint }
}

/**
 * Para el poll de la UI: ¿ya se acreditó? Autoriza con resolverConsultorio (no
 * con la sesión cruda): la SECRETARIA también polea desde el check-in, y la RLS
 * de `cobros` es médico-only — tras el authz se lee con service acotado al
 * médico operado.
 */
export async function estadoCobro(
  cobroId: string,
): Promise<{ estado: EstadoCobro; monto: number; medio: MedioCobro } | { error: string }> {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return { error: 'No autenticado' }
  if (!uuidSchema.safeParse(cobroId).success) return { error: 'Cobro inválido' }

  const cobro = await getCobroById(createServiceClient(), r.ctx.medicoActivoId, cobroId)
  if (!cobro) return { error: 'Cobro no encontrado' }
  return { estado: cobro.estado, monto: Number(cobro.monto), medio: cobro.medio }
}

/** Anula un cobro PENDIENTE (el paciente no pagó y se desistió del link). Mismo authz que estadoCobro. */
export async function anularCobroPendiente(cobroId: string): Promise<{ ok: true } | { error: string }> {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return { error: 'No autenticado' }
  if (!uuidSchema.safeParse(cobroId).success) return { error: 'Cobro inválido' }

  const ok = await anularCobroService(createServiceClient(), r.ctx.medicoActivoId, cobroId)
  if (!ok) return { error: 'Solo se anulan cobros pendientes.' }
  return { ok: true }
}

/** ¿El médico tiene MercadoPago conectado y sano? (para mostrar u ocultar el botón de link). */
export async function getMpConectado(): Promise<{ conectado: boolean; estado: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { conectado: false, estado: null }

  const { data } = await supabase
    .from('mp_conexiones')
    .select('estado')
    .eq('medico_id', user.id)
    .maybeSingle()
  const estado = (data as { estado: string } | null)?.estado ?? null
  return { conectado: estado === 'conectado', estado }
}
