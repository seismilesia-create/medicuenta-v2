import type { SupabaseClient } from '@supabase/supabase-js'
import type { MedicoNodo } from '@/lib/whatsapp/desambiguacionRuteo'

// Ruteo de conversación: (nodo, paciente) → médico (PRP-006, Fase 1).
// Cierra el HUECO del informe: el [ID:slug] del link solo viaja en el 1.er
// mensaje; del 2.º en adelante el paciente escribe libre y resolvemos el médico
// por esta tabla. Escritura por service-role (bypassa RLS).

export type EstadoRuteo = 'activa' | 'esperando_confirmacion' | 'esperando_nombre' | 'esperando_seleccion'

export interface SesionRuteo {
  medicoId: string | null
  estado: EstadoRuteo
  lastActivityAt: string
  candidatos: MedicoNodo[] | null
}

/** Sesión de ruteo (nodo, paciente) con su estado. null si no existe todavía. */
export async function getSesionRuteo(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
): Promise<SesionRuteo | null> {
  const { data } = await db
    .from('wa_ruteo_conversacion')
    .select('medico_id, estado, last_activity_at, candidatos')
    .eq('phone_number_id', phoneNumberId)
    .eq('telefono_paciente', telefonoPaciente)
    .maybeSingle()
  if (!data) return null
  const d = data as {
    medico_id: string | null
    estado: EstadoRuteo
    last_activity_at: string
    candidatos: MedicoNodo[] | null
  }
  return { medicoId: d.medico_id, estado: d.estado, lastActivityAt: d.last_activity_at, candidatos: d.candidatos }
}

/** Deja la sesión en 'activa' con el médico resuelto (limpia candidatos y refresca actividad). */
export async function setSesionActiva(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
  medicoId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db.from('wa_ruteo_conversacion').upsert(
    {
      phone_number_id: phoneNumberId,
      telefono_paciente: telefonoPaciente,
      medico_id: medicoId,
      estado: 'activa',
      last_activity_at: now,
      candidatos: null,
      updated_at: now,
    },
    { onConflict: 'phone_number_id,telefono_paciente' },
  )
}

/** Pone la sesión en un estado de espera (con candidatos opcionales para resolver la próxima respuesta). */
export async function setSesionEsperando(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
  estado: Exclude<EstadoRuteo, 'activa'>,
  opts?: { medicoId?: string | null; candidatos?: MedicoNodo[] | null },
): Promise<void> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    phone_number_id: phoneNumberId,
    telefono_paciente: telefonoPaciente,
    estado,
    candidatos: opts?.candidatos ?? null,
    updated_at: now,
  }
  if (opts && 'medicoId' in opts) row.medico_id = opts.medicoId ?? null
  await db.from('wa_ruteo_conversacion').upsert(row, { onConflict: 'phone_number_id,telefono_paciente' })
}

/** Refresca last_activity_at de una sesión activa (mantiene viva la ventana del TTL). */
export async function bumpActividad(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .from('wa_ruteo_conversacion')
    .update({ last_activity_at: now, updated_at: now })
    .eq('phone_number_id', phoneNumberId)
    .eq('telefono_paciente', telefonoPaciente)
}
