'use server'

import { z } from 'zod'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { resolverConsultorio, esDueño } from '@/features/consultorio/access/contexto'
import { createServiceClient } from '@/lib/supabase/server'

/** Config del consultorio = médico-only (spec §8). Solo el DUEÑO del consultorio
 *  (ni la secretaria ni un médico operando otro consultorio) puede cambiarla. */
async function ctxDueño() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!esDueño(r.ctx)) return { error: 'Solo el médico puede cambiar la configuración' as const }
  return { supabase: r.supabase, medicoId: r.ctx.userId }
}

/** Config OPERATIVA: la puede tocar el médico dueño O la secretaria vinculada, sobre el
 *  consultorio que están operando (medicoActivoId, derivado server-side). Las actions que la
 *  usan escriben con service-role (RLS de la secretaria no cubre estas tablas). */
async function ctxOperativo() {
  const r = await resolverConsultorio()
  if (!r) return { error: 'No autenticado' as const }
  if (!r.ctx.medicoActivoId) return { error: 'No estás operando ningún consultorio' as const }
  return { medicoId: r.ctx.medicoActivoId as string, userId: r.ctx.userId, esDueño: esDueño(r.ctx) }
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
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
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
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
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

export async function agregarOsSuspendida(
  nombreOs: string,
  nota: string,
  motivo: 'suspendida' | 'no_atiende',
) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (motivo !== 'suspendida' && motivo !== 'no_atiende') return { error: 'Motivo inválido' }
  // Normalizada al guardar (review parte 1): el UNIQUE es sensible, el match no.
  const nombre = normalizarOs(nombreOs)
  if (!nombre || nombre === 'particular') return { error: 'Nombre de obra social inválido' }
  const { error } = await supabase
    .from('wa_os_suspendidas')
    .insert({ medico_id: medicoId, nombre_os: nombre, nota: nota.trim() || null, motivo })
  if (error) {
    if (error.code === '23505') return { error: 'Esa obra social ya está en tus listas' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarOsSuspendida(id: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  const { error } = await supabase.from('wa_os_suspendidas').delete().eq('medico_id', medicoId).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function agregarDiaSemanalParticular(diaSemana: number) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return { error: 'Día de la semana inválido' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'semanal', dia_semana: diaSemana })
  if (error) {
    if (error.code === '23505') return { error: 'Ese día ya está marcado como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function agregarFechaParticular(fecha: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }
  const { error } = await supabase
    .from('wa_dias_particulares')
    .insert({ medico_id: medicoId, tipo: 'fecha', fecha })
  if (error) {
    if (error.code === '23505') return { error: 'Esa fecha ya está marcada como particular' }
    return { error: error.message }
  }
  return { ok: true as const }
}

export async function quitarDiaParticular(id: string) {
  const c = await ctxOperativo()
  if ('error' in c) return c
  const { medicoId } = c
  const supabase = createServiceClient()
  const { error } = await supabase.from('wa_dias_particulares').delete().eq('medico_id', medicoId).eq('id', id)
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
