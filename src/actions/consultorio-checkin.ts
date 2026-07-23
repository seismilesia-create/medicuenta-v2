'use server'

import { z } from 'zod'
import { resolverConsultorio } from '@/features/consultorio/access/contexto'

// Check-in de recepción (Fase B): la secretaria (o el médico) marca la llegada
// del paciente, registra el cobro y la orden presentada. Molde de autorización
// de consultorio-recetas.ts: `medicoId` = consultorio operado, `userId` = quién
// firma; las tablas médico-only se tocan con service-role RECIÉN tras ese check.

/** Autoriza: médico operado (dueño o secretaria) + user que firma. null si no autorizado. */
async function ctxCheckin() {
  const r = await resolverConsultorio()
  if (!r || !r.ctx.medicoActivoId) return null
  return { supabase: r.supabase, medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId as string }
}

const checkinSchema = z.object({
  tipo: z.enum(['turno', 'sobreturno']),
  id: z.string().uuid(),
  deshacer: z.boolean().default(false),
})

/**
 * Marca (o deshace) la llegada del paciente. User client: la RLS delegada de
 * wa_turnos/wa_sobreturnos ya cubre a la secretaria. No toca `estado` — la
 * llegada es una columna aparte y la máquina de estados queda intacta.
 */
export async function marcarCheckin(input: z.infer<typeof checkinSchema>) {
  const c = await ctxCheckin()
  if (!c) return { error: 'No autenticado' }
  const parsed = checkinSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const tabla = d.tipo === 'turno' ? 'wa_turnos' : 'wa_sobreturnos'
  const estadosVivos = d.tipo === 'turno' ? ['reservado', 'confirmado'] : ['pendiente']

  let query = c.supabase
    .from(tabla)
    .update(
      d.deshacer
        ? { checkin_at: null, checkin_por: null, updated_at: new Date().toISOString() }
        : { checkin_at: new Date().toISOString(), checkin_por: c.userId, updated_at: new Date().toISOString() },
    )
    .eq('medico_id', c.medicoId)
    .eq('id', d.id)
    .in('estado', estadosVivos)
  // Marcar exige que NO haya llegada previa (preserva la hora real de llegada);
  // deshacer exige que la haya.
  query = d.deshacer ? query.not('checkin_at', 'is', null) : query.is('checkin_at', null)

  const { data, error } = await query.select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: d.deshacer ? 'Esa llegada ya no está marcada' : 'Ese turno ya no admite marcar la llegada (refrescá la agenda)' }
  }
  return { ok: true as const }
}
