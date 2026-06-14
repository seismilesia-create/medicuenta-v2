import type { SupabaseClient } from '@supabase/supabase-js'

// Ruteo de conversación: (nodo, paciente) → médico (PRP-006, Fase 1).
// Cierra el HUECO del informe: el [ID:slug] del link solo viaja en el 1.er
// mensaje; del 2.º en adelante el paciente escribe libre y resolvemos el médico
// por esta tabla. Escritura por service-role (bypassa RLS).

/** Médico ruteado para (phone_number_id del nodo, teléfono del paciente). null si es el 1.er contacto. */
export async function getRuteoMedico(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
): Promise<string | null> {
  const { data } = await db
    .from('wa_ruteo_conversacion')
    .select('medico_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('telefono_paciente', telefonoPaciente)
    .maybeSingle()
  if (!data) return null
  return (data as { medico_id: string }).medico_id
}

/** Persiste/re-ancla el ruteo (nodo, paciente) → médico. Idempotente por (phone_number_id, telefono_paciente). */
export async function upsertRuteoMedico(
  db: SupabaseClient,
  phoneNumberId: string,
  telefonoPaciente: string,
  medicoId: string,
): Promise<void> {
  await db.from('wa_ruteo_conversacion').upsert(
    {
      phone_number_id: phoneNumberId,
      telefono_paciente: telefonoPaciente,
      medico_id: medicoId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'phone_number_id,telefono_paciente' },
  )
}
