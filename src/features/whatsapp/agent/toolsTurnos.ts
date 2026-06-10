import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { resolverServicio } from '@/lib/turnos/resolverServicio'
import { armarStartsAtISO, fmtFechaLarga, fmtHora } from '@/lib/turnos/formato'
import { esSlotOfrecido, AR_OFFSET } from '@/lib/turnos/slots'
import {
  getServiciosActivos,
  getDisponibilidad,
  crearTurno,
  listarTurnosDePaciente,
  cancelarTurnoDePaciente,
} from '@/features/whatsapp/services/turnosService'

export interface TurnosToolsCtx {
  db: SupabaseClient
  medicoId: string
  telefonoPaciente: string
  contactoId: string | null
}

/** Caps de la respuesta de disponibilidad (mismos del origen): no abrumar el contexto. */
const DIAS_EN_RESPUESTA = 5
const SLOTS_POR_DIA = 24

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tools de turnos del agente del paciente. medico_id INYECTADO (el webhook no tiene sesión). */
export function buildTurnosTools(ctx: TurnosToolsCtx) {
  return {
    consultar_disponibilidad: tool({
      description:
        'Devuelve los próximos horarios disponibles para un turno. Usala SIEMPRE antes de ofrecer horarios, y también si preguntan qué días u horarios atiende el médico.',
      inputSchema: z.object({
        servicio: z
          .string()
          .describe('Nombre del servicio que pide el paciente. "" si no especificó o si hay uno solo.'),
      }),
      execute: async ({ servicio }) => {
        const servicios = await getServiciosActivos(ctx.db, ctx.medicoId)
        const res = resolverServicio(servicios, servicio)
        if (res.tipo === 'ninguno') {
          return { error: 'El médico todavía no configuró la agenda de turnos. Sugerile consultarlo directamente.' }
        }
        if (res.tipo === 'elegir') {
          return {
            elegir_entre: res.opciones.map((s) => ({ servicio: s.nombre, duracion_min: s.duracion_min, precio: s.precio })),
            instruccion: 'Preguntale al paciente cuál de estos servicios quiere antes de ofrecer horarios.',
          }
        }
        const dias = await getDisponibilidad(ctx.db, ctx.medicoId, res.servicio)
        if (dias.length === 0) {
          return { servicio: res.servicio.nombre, mensaje: 'No hay horarios disponibles en los próximos días.' }
        }
        return {
          servicio: res.servicio.nombre,
          duracion_min: res.servicio.duracion_min,
          precio: res.servicio.precio,
          disponibilidad: dias.slice(0, DIAS_EN_RESPUESTA).map((d) => ({
            fecha: d.date, // YYYY-MM-DD — pasala TAL CUAL a reservar_turno
            dia: fmtFechaLarga(`${d.date}T12:00:00${AR_OFFSET}`),
            horarios: d.slots.slice(0, SLOTS_POR_DIA).map((s) => s.label),
          })),
          instruccion:
            'Ofrecé SOLO estos horarios, con fecha y hora EXACTAS. Para reservar llamá a reservar_turno con la fecha (YYYY-MM-DD) y la hora (HH:MM) elegidas. Si preguntan el precio y figura null, NO inventes montos: que lo consulte con el médico.',
        }
      },
    }),

    reservar_turno: tool({
      description:
        'Reserva un turno en uno de los horarios devueltos por consultar_disponibilidad. Antes de llamarla confirmá con el paciente el servicio, el día y la hora, y tené su nombre completo.',
      inputSchema: z.object({
        servicio: z.string().describe('Nombre del servicio. "" si hay uno solo.'),
        fecha: z.string().describe('Fecha YYYY-MM-DD EXACTA devuelta por consultar_disponibilidad'),
        hora: z.string().describe('Hora HH:MM (24h) EXACTA de uno de los horarios ofrecidos'),
        nombre_paciente: z.string().describe('Nombre completo del paciente. "" si todavía no lo dio (pedíselo antes).'),
      }),
      execute: async ({ servicio, fecha, hora, nombre_paciente }) => {
        if (!nombre_paciente.trim()) {
          return { ok: false, error: 'Falta el nombre completo del paciente: pedíselo antes de reservar.' }
        }
        const servicios = await getServiciosActivos(ctx.db, ctx.medicoId)
        const res = resolverServicio(servicios, servicio)
        if (res.tipo !== 'ok') {
          return { ok: false, error: 'No pude determinar el servicio. Llamá primero a consultar_disponibilidad.' }
        }
        const startsAt = armarStartsAtISO(fecha, hora)
        if (!startsAt) {
          return {
            ok: false,
            error: 'Fecha u hora inválida. Usá la fecha YYYY-MM-DD y la hora HH:MM EXACTAS que devolvió consultar_disponibilidad.',
          }
        }
        // Anti-horario-inventado: tiene que ser un slot realmente ofrecido AHORA.
        const dias = await getDisponibilidad(ctx.db, ctx.medicoId, res.servicio)
        if (!esSlotOfrecido(dias, startsAt)) {
          return {
            ok: false,
            error: 'Ese horario no está disponible. Volvé a llamar a consultar_disponibilidad y ofrecé los horarios reales.',
          }
        }
        const r = await crearTurno(ctx.db, ctx.medicoId, {
          servicio: res.servicio,
          startsAt,
          pacienteTelefono: normalizeRecipient(ctx.telefonoPaciente),
          // Tope: un "nombre" kilométrico rompería el resumen del médico (4096 chars de WhatsApp).
          pacienteNombre: nombre_paciente.trim().slice(0, 120),
          contactoId: ctx.contactoId,
        })
        if (!r.ok) return { ok: false, error: r.error }
        return {
          ok: true,
          mensaje: `Turno confirmado: ${res.servicio.nombre} el ${fmtFechaLarga(startsAt)} a las ${fmtHora(startsAt)} hs.`,
        }
      },
    }),

    cancelar_turno: tool({
      description:
        'Lista o cancela turnos DEL PACIENTE que escribe (solo los suyos). Llamala con turno_id="" para listar — también si pregunta qué turnos tiene o cuándo es su turno. Para cancelar: confirmá con el paciente y llamala de nuevo con el turno_id elegido.',
      inputSchema: z.object({
        turno_id: z.string().describe('El turno_id devuelto por esta misma tool al listar. "" para listar.'),
      }),
      execute: async ({ turno_id }) => {
        const telefono = normalizeRecipient(ctx.telefonoPaciente)
        const id = turno_id.trim()
        if (!id) {
          const turnos = await listarTurnosDePaciente(ctx.db, ctx.medicoId, telefono)
          if (turnos.length === 0) {
            return { turnos: [], mensaje: 'No hay turnos próximos a nombre de este número de WhatsApp.' }
          }
          return {
            turnos: turnos.map((t) => ({
              turno_id: t.id,
              dia: fmtFechaLarga(t.starts_at),
              hora: fmtHora(t.starts_at),
            })),
            instruccion:
              turnos.length === 1
                ? 'Confirmá con el paciente que quiere cancelar ESE turno y llamá de nuevo con su turno_id.'
                : 'Preguntale cuál quiere cancelar y llamá de nuevo con el turno_id elegido.',
          }
        }
        // Un id inventado por el modelo reventaría como 22P02 en la columna uuid.
        if (!UUID_RE.test(id)) {
          return { ok: false, error: 'Ese turno_id no existe. Llamá de nuevo con turno_id="" para listar los turnos reales.' }
        }
        const r = await cancelarTurnoDePaciente(ctx.db, ctx.medicoId, telefono, id)
        if (!r.ok) return { ok: false, error: r.error }
        return { ok: true, mensaje: 'Turno cancelado. El horario quedó liberado.' }
      },
    }),
  }
}
