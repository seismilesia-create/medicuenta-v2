'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiciosActivos, getDisponibilidad, crearTurno } from '@/features/whatsapp/services/turnosService'
import { armarStartsAtISO } from '@/lib/turnos/formato'
import { esSlotOfrecido, arDateString } from '@/lib/turnos/slots'
import { diasDesdeHoy } from '@/lib/consultorio/calendario'
import { upsertPacienteDesdeIdentidad } from '@/features/whatsapp/services/pacientesService'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import { normalizeRecipient } from '@/lib/whatsapp/client'

async function medicoAutenticado() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  return { supabase, user }
}

const turnoManualSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{1,2}:\d{2}$/),
  nombre: z.string().min(1, 'Falta el nombre'),
  apellido: z.string().min(1, 'Falta el apellido'),
  dni: z.string().trim(), // opcional (spec §5.2): "" = sin DNI
  obraSocial: z.string().min(1, 'Indicá la obra social o "particular"'),
  telefono: z.string().trim(), // opcional
  motivo: z.string().trim(),
})

export async function turnoManual(input: z.infer<typeof turnoManualSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = turnoManualSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const dniNorm = d.dni.replace(/\D/g, '')
  if (d.dni && !/^\d{7,8}$/.test(dniNorm)) return { error: 'DNI inválido (7 u 8 dígitos), o dejalo vacío' }

  const servicios = await getServiciosActivos(supabase, user.id)
  if (servicios.length === 0) return { error: 'Configurá primero los horarios y la duración en Config' }
  const startsAt = armarStartsAtISO(d.fecha, d.hora.padStart(5, '0'))
  if (!startsAt) return { error: 'Fecha u hora inválida' }
  // Horizonte hasta la fecha pedida (las vistas semana/mes permiten dar turnos más allá
  // de los 14 días que ofrece el bot); el bot sigue llamando con su default — intacto.
  const horizonte = Math.min(Math.max(diasDesdeHoy(d.fecha) + 1, 1), 90)
  const dias = await getDisponibilidad(supabase, user.id, servicios[0], horizonte)
  if (!esSlotOfrecido(dias, startsAt)) return { error: 'Ese horario ya no está libre — refrescá la agenda' }

  const r = await crearTurno(supabase, user.id, {
    servicio: servicios[0],
    startsAt,
    pacienteTelefono: d.telefono ? normalizeRecipient(d.telefono) : null,
    pacienteNombre: d.nombre,
    pacienteApellido: d.apellido,
    pacienteDni: dniNorm,
    pacienteObraSocial: d.obraSocial,
    motivo: d.motivo.slice(0, 200),
    contactoId: null,
    origen: 'panel',
    creadoPor: user.id,
  })
  if (!r.ok) return { error: r.error }
  return { ok: true as const }
}

export async function cancelarTurnoPanel(turnoId: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { data, error } = await supabase
    .from('wa_turnos')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', turnoId)
    .in('estado', ['reservado', 'confirmado'])
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Ese turno ya no se puede cancelar' }
  return { ok: true as const }
}

/** Asistencia (spec §5.4): marcar "no vino" o volverlo a atendido. */
export async function marcarAsistencia(turnoId: string, noVino: boolean) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { data, error } = await supabase
    .from('wa_turnos')
    .update({ estado: noVino ? 'ausente' : 'reservado', updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', turnoId)
    .in('estado', noVino ? ['reservado', 'confirmado'] : ['ausente'])
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Ese turno ya no se puede marcar (refrescá la agenda)' }
  return { ok: true as const }
}

const sobreturnoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nombre: z.string().min(1, 'Falta el nombre'),
  apellido: z.string().min(1, 'Falta el apellido'),
  dni: z.string().trim(),
  obraSocial: z.string().trim(),
  telefono: z.string().trim(),
  cobro: z.enum(['particular', 'sin_cargo']),
  notas: z.string().trim(),
})

export async function crearSobreturno(input: z.infer<typeof sobreturnoSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = sobreturnoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const dniNorm = d.dni.replace(/\D/g, '')
  if (d.dni && !/^\d{7,8}$/.test(dniNorm)) return { error: 'DNI inválido (7 u 8 dígitos), o dejalo vacío' }
  const telNorm = d.telefono ? normalizeRecipient(d.telefono) : null

  const { error } = await supabase.from('wa_sobreturnos').insert({
    medico_id: user.id,
    fecha: d.fecha,
    paciente_nombre: d.nombre,
    paciente_apellido: d.apellido,
    paciente_dni: dniNorm || null,
    paciente_obra_social: d.obraSocial || null,
    paciente_telefono: telNorm,
    cobro: d.cobro,
    notas: d.notas || null,
    creado_por: user.id,
  })
  if (error) return { error: error.message }

  // La base de pacientes se arma sola también desde sobreturnos (spec §7).
  if (dniNorm) {
    try {
      await upsertPacienteDesdeIdentidad(supabase, user.id, {
        nombre: d.nombre,
        apellido: d.apellido,
        dni: dniNorm,
        obraSocial: d.obraSocial || null,
        telefono: telNorm,
      })
    } catch (e) {
      await registrarEvento(supabase, {
        medicoId: user.id,
        origen: 'panel',
        nivel: 'error',
        evento: 'upsert_paciente_error',
        detalle: { error: String(e), dni: dniNorm },
      })
    }
  }
  return { ok: true as const }
}

export async function setEstadoSobreturno(id: string, estado: 'pendiente' | 'atendido' | 'no_vino' | 'cancelado') {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase
    .from('wa_sobreturnos')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('medico_id', user.id)
    .eq('id', id)
  if (error) return { error: error.message }
  return { ok: true as const }
}

const bloquearSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nota: z.string().trim(),
})

export async function bloquearDias(input: z.infer<typeof bloquearSchema>) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const parsed = bloquearSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.hasta < d.desde) return { error: 'El rango está invertido' }
  if (d.desde < arDateString(Date.now(), 0)) return { error: 'No se puede bloquear el pasado' }
  const { error } = await supabase.from('wa_excepciones').insert({
    medico_id: user.id,
    start_date: d.desde,
    end_date: d.hasta,
    kind: 'closed',
    ranges: [],
    note: d.nota || null,
  })
  if (error) return { error: error.message }
  return { ok: true as const }
}

export async function desbloquearDias(excepcionId: string) {
  const { supabase, user } = await medicoAutenticado()
  if (!user) return { error: 'No autenticado' }
  const { error } = await supabase.from('wa_excepciones').delete().eq('medico_id', user.id).eq('id', excepcionId)
  if (error) return { error: error.message }
  return { ok: true as const }
}
