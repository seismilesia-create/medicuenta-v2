'use server'

import { z } from 'zod'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'

/** Config del consultorio = médico-only (spec §8). Solo el DUEÑO del consultorio
 *  (ni la secretaria ni un médico operando otro consultorio) puede cambiarla. */
async function ctxDueño() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede cambiar la configuración' as const }
  return { supabase: r.supabase, medicoId: r.ctx.userId }
}

const horariosSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    open_time: z.string().regex(/^\d{2}:\d{2}$/),
    close_time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
)

/** Reemplaza el horario semanal completo.
 *  Estrategia: insert primero → delete por id de los viejos. Si el insert falla,
 *  el horario anterior queda intacto (sin ventana destructiva).
 *  Los turnos YA dados fuera del nuevo horario NO se tocan (spec §8.1). */
export async function guardarHorarios(bloques: z.infer<typeof horariosSchema>) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const parsed = horariosSchema.safeParse(bloques)
  if (!parsed.success) return { error: 'Horarios inválidos' }
  for (const b of parsed.data) {
    if (b.close_time <= b.open_time) return { error: `Bloque inválido: ${b.open_time}–${b.close_time}` }
  }

  // Bloques solapados en el mismo día → la agenda mostraría huecos duplicados.
  const porDia = new Map<number, { open_time: string; close_time: string }[]>()
  for (const b of parsed.data) {
    const dia = porDia.get(b.weekday) ?? []
    for (const otro of dia) {
      if (b.open_time < otro.close_time && otro.open_time < b.close_time) {
        return { error: `Bloques solapados el mismo día (${b.open_time}–${b.close_time})` }
      }
    }
    dia.push(b)
    porDia.set(b.weekday, dia)
  }

  // Insertar primero y borrar después por id: si el insert falla, el horario viejo queda intacto.
  const { data: viejos, error: selError } = await supabase.from('wa_horarios').select('id').eq('medico_id', medicoId)
  if (selError) return { error: selError.message }
  if (parsed.data.length > 0) {
    const { error } = await supabase.from('wa_horarios').insert(parsed.data.map((b) => ({ medico_id: medicoId, ...b })))
    if (error) return { error: error.message }
  }
  const idsViejos = ((viejos as { id: string }[] | null) ?? []).map((v) => v.id)
  if (idsViejos.length > 0) {
    const { error: delError } = await supabase.from('wa_horarios').delete().eq('medico_id', medicoId).in('id', idsViejos)
    if (delError) return { error: delError.message }
  }
  return { ok: true as const }
}

/** Cambia la duración del único servicio "Consulta" (spec D12). Solo afecta turnos futuros. */
export async function guardarDuracionConsulta(servicioId: string, duracionMin: number) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  if (!Number.isInteger(duracionMin) || duracionMin < 5 || duracionMin > 120) {
    return { error: 'Duración inválida (entre 5 y 120 minutos)' }
  }
  const { error } = await supabase
    .from('wa_servicios')
    .update({ duracion_min: duracionMin, updated_at: new Date().toISOString() })
    .eq('medico_id', medicoId)
    .eq('id', servicioId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function agregarOsSuspendida(nombreOs: string, nota: string) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  // Normalizada al guardar (review parte 1): el UNIQUE es sensible, el match no.
  const nombre = normalizarOs(nombreOs)
  if (!nombre || nombre === 'particular') return { error: 'Nombre de obra social inválido' }
  const { error } = await supabase
    .from('wa_os_suspendidas')
    .insert({ medico_id: medicoId, nombre_os: nombre, nota: nota.trim() || null })
  if (error) {
    if (error.code === '23505') return { error: 'Esa obra social ya está en la lista' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarOsSuspendida(id: string) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const { error } = await supabase.from('wa_os_suspendidas').delete().eq('medico_id', medicoId).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

const agenteSchema = z.object({
  nombre_medico: z.string().trim(),
  especialidad: z.string().trim(),
  tono: z.string().trim(),
  saludo: z.string().trim(),
  faqs: z.array(z.object({ pregunta: z.string().min(1), respuesta: z.string().min(1) })).max(20),
  precio_receta: z.number().nonnegative().nullable(),
})

export async function guardarAsistente(input: z.infer<typeof agenteSchema>) {
  const c = await ctxDueño()
  if ('error' in c) return c
  const { supabase, medicoId } = c
  const parsed = agenteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const { error } = await supabase
    .from('wa_config_agente')
    .upsert(
      {
        medico_id: medicoId,
        nombre_medico: d.nombre_medico || null,
        especialidad: d.especialidad || null,
        tono: d.tono || null,
        saludo: d.saludo || null,
        faqs: d.faqs,
        precio_receta_default: d.precio_receta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'medico_id' },
    )
  if (error) return { error: error.message }
  return { ok: true as const }
}
