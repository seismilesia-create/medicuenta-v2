'use server'

import { z } from 'zod'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'

const editarSchema = z.object({
  pacienteId: z.string().uuid(),
  nombre: z.string().trim(),
  apellido: z.string().trim(),
  dni: z.string().trim().regex(/^\d{7,8}$/, 'DNI inválido (7 u 8 dígitos)'),
  obraSocial: z.string().trim(),
})

/** Corrección de datos de la ficha (spec §7). Cambiar el DNI re-keyea: avisar en la UI.
 *  La secretaria puede corregir datos (no recetas): opera con el medicoActivoId. */
export async function editarPaciente(input: z.infer<typeof editarSchema>) {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return { error: 'No autenticado' }
  const { supabase, ctx } = r
  const parsed = editarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const { error } = await supabase
    .from('wa_pacientes')
    .update({
      nombre: d.nombre || null,
      apellido: d.apellido || null,
      dni: d.dni,
      obra_social: d.obraSocial || null,
      updated_at: new Date().toISOString(),
    })
    .eq('medico_id', ctx.medicoActivoId)
    .eq('id', d.pacienteId)
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe otro paciente con ese DNI' }
    return { error: error.message }
  }
  return { ok: true as const }
}
