import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeTelefonos } from '@/lib/consultorio/pacientes'

export interface IdentidadPaciente {
  nombre: string
  apellido: string
  /** Ya normalizado (solo dígitos) por el caller. Sin DNI no hay paciente (spec §5/§7). */
  dni: string
  obraSocial?: string | null
  telefono?: string | null
}

/**
 * La base de pacientes se arma sola: upsert por (medico_id, dni).
 * Reglas de merge (plan parte 1): nombre/apellido existentes NO se pisan (una
 * corrección manual del panel manda); la obra social nueva SÍ pisa (la gente
 * cambia de OS); los teléfonos se acumulan sin duplicar.
 */
export async function upsertPacienteDesdeIdentidad(
  db: SupabaseClient,
  medicoId: string,
  p: IdentidadPaciente,
): Promise<void> {
  if (!p.dni) return

  const { data: existente, error: errLectura } = await db
    .from('wa_pacientes')
    .select('id, nombre, apellido, obra_social, telefonos')
    .eq('medico_id', medicoId)
    .eq('dni', p.dni)
    .maybeSingle()
  // Un fallo de lectura NO puede degradar a "no existe": insertaría un duplicado
  // y la bitácora registraría una causa falsa. El caller (hook) loguea la real.
  if (errLectura) throw errLectura

  if (!existente) {
    const { error } = await db.from('wa_pacientes').insert({
      medico_id: medicoId,
      dni: p.dni,
      nombre: p.nombre.trim() || null,
      apellido: p.apellido.trim() || null,
      obra_social: p.obraSocial?.trim() || null,
      telefonos: mergeTelefonos([], p.telefono),
    })
    if (error) throw error
    return
  }

  const e = existente as {
    id: string
    nombre: string | null
    apellido: string | null
    obra_social: string | null
    telefonos: unknown
  }
  const { error } = await db
    .from('wa_pacientes')
    .update({
      nombre: e.nombre || p.nombre.trim() || null,
      apellido: e.apellido || p.apellido.trim() || null,
      obra_social: p.obraSocial?.trim() || e.obra_social || null,
      telefonos: mergeTelefonos(e.telefonos, p.telefono),
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', medicoId)
    .eq('id', e.id)
  if (error) throw error
}
