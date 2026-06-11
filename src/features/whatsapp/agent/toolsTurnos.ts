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

/** Caps de la respuesta de disponibilidad: no abrumar el contexto ni al paciente. */
const DIAS_EN_RESPUESTA = 7
const SLOTS_POR_DIA = 24
/** Tope de turnos activos por número: sin esto, un solo WhatsApp podría reservarse TODA la agenda. */
const MAX_TURNOS_ACTIVOS_POR_PACIENTE = 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tools de turnos del agente del paciente. medico_id INYECTADO (el webhook no tiene sesión). */
export function buildTurnosTools(ctx: TurnosToolsCtx) {
  return {
    consultar_disponibilidad: tool({
      description:
        'Disponibilidad de turnos en dos pasos: con fecha_preferida:"" devuelve los DÍAS con lugar (para preguntarle al paciente cuál le queda bien, SIN horarios); con una fecha YYYY-MM-DD devuelve los horarios de ESE día (o las alternativas más cercanas si ese día no tiene).',
      inputSchema: z.object({
        servicio: z
          .string()
          .describe('Nombre del servicio que pide el paciente. "" si no especificó o si hay uno solo.'),
        fecha_preferida: z
          .string()
          .describe('Día que pidió el paciente, en YYYY-MM-DD (convertí "mañana"/"el lunes" usando la fecha de HOY del contexto). "" si todavía no eligió día.'),
      }),
      execute: async ({ servicio, fecha_preferida }) => {
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

        const fechaPref = fecha_preferida.trim()
        if (!fechaPref) {
          // Paso 1 de la conversación: SOLO los días con lugar — el choclazo de
          // horarios de todos los días marea al paciente (feedback del dueño).
          return {
            servicio: res.servicio.nombre,
            duracion_min: res.servicio.duracion_min,
            precio: res.servicio.precio,
            dias_con_lugar: dias.slice(0, DIAS_EN_RESPUESTA).map((d) => ({
              fecha: d.date,
              dia: fmtFechaLarga(`${d.date}T12:00:00${AR_OFFSET}`),
            })),
            instruccion:
              'Preguntale al paciente cuál de estos días le queda bien — NO listes horarios todavía. Cuando elija, llamame de nuevo con esa fecha_preferida. Si pregunta el precio y figura null, NO inventes montos: que lo consulte con el médico.',
          }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPref)) {
          return {
            error: 'fecha_preferida inválida: usá YYYY-MM-DD (convertí "mañana"/"el lunes" con la fecha de HOY) o "" para listar los días con lugar.',
          }
        }
        const delDia = dias.find((d) => d.date === fechaPref)
        if (delDia) {
          return {
            servicio: res.servicio.nombre,
            duracion_min: res.servicio.duracion_min,
            precio: res.servicio.precio,
            fecha: delDia.date, // YYYY-MM-DD — pasala TAL CUAL a reservar_turno
            dia: fmtFechaLarga(`${delDia.date}T12:00:00${AR_OFFSET}`),
            horarios: delDia.slots.slice(0, SLOTS_POR_DIA).map((s) => s.label),
            instruccion:
              'Ofrecé SOLO estos horarios de ese día, EXACTOS. Para reservar llamá a reservar_turno con esta fecha y la hora elegida.',
          }
        }
        // El día pedido no tiene lugar → ofrecer lo más cercano a esa fecha.
        const pedidoMs = new Date(`${fechaPref}T12:00:00${AR_OFFSET}`).getTime()
        const distancia = (d: { date: string }) =>
          Math.abs(new Date(`${d.date}T12:00:00${AR_OFFSET}`).getTime() - pedidoMs)
        const cercanas = [...dias].sort((a, b) => distancia(a) - distancia(b)).slice(0, 2)
        return {
          sin_lugar_en: fechaPref,
          alternativas_cercanas: cercanas.map((d) => ({
            fecha: d.date,
            dia: fmtFechaLarga(`${d.date}T12:00:00${AR_OFFSET}`),
            horarios: d.slots.slice(0, SLOTS_POR_DIA).map((s) => s.label),
          })),
          instruccion: 'Ese día no hay lugar: avisale al paciente y ofrecele estas alternativas más cercanas (horarios EXACTOS).',
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
        motivo_consulta: z
          .string()
          .describe('Motivo breve de la consulta, tal como lo dijo el paciente. "" si no quiso decirlo.'),
      }),
      execute: async ({ servicio, fecha, hora, nombre_paciente, motivo_consulta }) => {
        if (!nombre_paciente.trim()) {
          return { ok: false, error: 'Falta el nombre completo del paciente: pedíselo antes de reservar.' }
        }
        const telefonoNorm = normalizeRecipient(ctx.telefonoPaciente)
        const activos = await listarTurnosDePaciente(ctx.db, ctx.medicoId, telefonoNorm)
        if (activos.length >= MAX_TURNOS_ACTIVOS_POR_PACIENTE) {
          return {
            ok: false,
            error: `El paciente ya tiene ${activos.length} turnos reservados desde este número. Para sacar otro tiene que cancelar uno antes (cancelar_turno).`,
          }
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
          pacienteTelefono: telefonoNorm,
          // Tope: un "nombre" kilométrico rompería el resumen del médico (4096 chars de WhatsApp).
          pacienteNombre: nombre_paciente.trim().slice(0, 120),
          motivo: motivo_consulta.trim().slice(0, 200),
          contactoId: ctx.contactoId,
        })
        if (!r.ok) return { ok: false, error: r.error }
        const inicioReal = r.yaExistia ?? startsAt
        return {
          ok: true,
          mensaje: r.yaExistia
            ? `El paciente YA tenía reservado este turno: ${res.servicio.nombre} el ${fmtFechaLarga(inicioReal)} a las ${fmtHora(inicioReal)} hs. No se duplicó nada.`
            : `Turno confirmado: ${res.servicio.nombre} el ${fmtFechaLarga(inicioReal)} a las ${fmtHora(inicioReal)} hs.`,
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
