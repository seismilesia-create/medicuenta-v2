import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { buildPreferenciaBody, buildPreferenciaBodyCobro, crearPreferencia } from '@/lib/mercadopago/client'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'
import {
  buscarPendientesPorIdentidad,
  getRecetaDelMedico,
  vincularPago,
  type RecetaRow,
} from '@/features/whatsapp/services/recetasService'
import { actualizarPendiente, crearCobro, getCobroVivoDeTurno } from '@/features/cobros/services/cobrosService'
import { normalizarOs } from '@/lib/consultorio/osSuspendidas'
import { esDiaParticular, type DiaParticular } from '@/lib/consultorio/diasParticulares'
import { arDateString, AR_OFFSET } from '@/lib/turnos/slots'

export interface PacienteToolsCtx {
  db: SupabaseClient
  medicoId: string
  telefonoPaciente: string
  contactoId: string | null
  conversacionId: string
  secretariaDisponible: boolean
}

function resumenMedicamento(r: RecetaRow): string {
  const meds = (r.datos_ocr as { medicamentos?: { droga?: string }[] })?.medicamentos
  return meds?.[0]?.droga ?? 'receta médica'
}

/** Tools del agente que atiende pacientes. medico_id INYECTADO (el webhook no tiene sesión). */
export function buildPacienteTools(ctx: PacienteToolsCtx) {
  return {
    // ⚠️ Identifica al paciente solo por nombre+DNI (sin factor de posesión). Trade-off de
    // privacidad ASUMIDO y documentado en recetasService.buscarPendientesPorIdentidad.
    buscar_receta_paciente: tool({
      description:
        'Busca recetas pendientes de pago del paciente por su nombre completo y DNI. Usala apenas el paciente dé sus datos.',
      inputSchema: z.object({
        nombre: z.string().describe('Nombre completo que dio el paciente'),
        dni: z.string().describe('DNI que dio el paciente (con o sin puntos)'),
      }),
      execute: async ({ nombre, dni }) => {
        const recetas = await buscarPendientesPorIdentidad(ctx.db, ctx.medicoId, nombre, dni)
        if (!recetas.length) {
          return { encontradas: 0, mensaje: 'No hay recetas pendientes de pago con esos datos. Sugerile verificar con su médico.' }
        }
        return {
          encontradas: recetas.length,
          recetas: recetas.map((r) => ({
            receta_id: r.id,
            medicamento: resumenMedicamento(r),
            monto: Number(r.monto),
          })),
          instruccion:
            'IMPORTANTE: para cobrar DEBÉS llamar a la tool cobrar_receta con el receta_id. NO escribas ningún link por tu cuenta: el único link válido es el que devuelve esa tool.',
        }
      },
    }),

    cobrar_receta: tool({
      description:
        'Genera el link de pago de MercadoPago para una receta encontrada con buscar_receta_paciente. Devolvé el link al paciente tal cual.',
      inputSchema: z.object({
        receta_id: z.string().describe('El receta_id devuelto por buscar_receta_paciente'),
      }),
      execute: async ({ receta_id }) => {
        const receta = await getRecetaDelMedico(ctx.db, ctx.medicoId, receta_id)
        if (!receta || receta.estado !== 'pendiente_pago' || receta.monto == null) {
          return { error: 'Esa receta no está disponible para cobro.' }
        }
        // Anti-secuestro de entrega (revisión Lote B): el PRIMER teléfono que gestiona
        // la receta queda como destinatario; otro número (aunque sepa nombre+DNI) no
        // puede desviar la entrega — se lo deriva al médico.
        const telefonoNorm = normalizeRecipient(ctx.telefonoPaciente)
        if (receta.paciente_telefono && receta.paciente_telefono !== telefonoNorm) {
          return {
            error:
              'Esa receta ya está siendo gestionada desde otro número de WhatsApp. Si sos el paciente, avisale a tu médico para que lo verifique.',
          }
        }
        const baseUrl = process.env.PUBLIC_BASE_URL
        if (!baseUrl) return { error: 'El sistema de pagos no está configurado todavía (falta PUBLIC_BASE_URL).' }
        const conexion = await getConexionActiva(ctx.db, ctx.medicoId)
        if (!conexion) {
          return { error: 'El médico todavía no tiene MercadoPago conectado. Avisale que debe conectarlo desde MediCuenta.' }
        }
        const body = buildPreferenciaBody(
          {
            recetaId: receta.id,
            titulo: 'Gestión de receta médica',
            monto: Number(receta.monto),
            notificationUrl: `${baseUrl}/api/mercadopago/webhook?receta=${receta.id}`,
            expiraEnDias: 7,
          },
          new Date(),
        )
        const pref = await crearPreferencia(conexion.accessToken, body)
        if (!pref) return { error: 'No pude generar el link de pago. Pedile que intente de nuevo en unos minutos.' }
        const vinculado = await vincularPago(ctx.db, ctx.medicoId, receta.id, {
          mpPreferenceId: pref.id,
          pacienteTelefono: normalizeRecipient(ctx.telefonoPaciente),
          contactoId: ctx.contactoId,
        })
        if (!vinculado.ok) {
          return {
            error:
              vinculado.motivo === 'conflicto'
                ? 'Esa receta ya está siendo gestionada desde otro número de WhatsApp. Si sos el paciente, avisale a tu médico para que lo verifique.'
                : 'No pude generar el link de pago. Pedile que intente de nuevo en unos minutos.',
          }
        }
        return { link: pref.initPoint, monto: Number(receta.monto) }
      },
    }),

    cobrar_turno_hoy: tool({
      description:
        'El paciente LLEGÓ al consultorio ("llegué", "estoy acá") o quiere pagar la consulta o el plus de su turno de HOY. Busca su turno de hoy y genera el link de pago (plus si tiene obra social, consulta completa si es particular). Devolvé el link tal cual.',
      inputSchema: z.object({}),
      execute: async () => {
        // Candado: el turno tiene que ser de ESTE número (mismo criterio que cancelar_turno).
        const telefonoNorm = normalizeRecipient(ctx.telefonoPaciente)
        const hoy = arDateString(Date.now(), 0)
        const desdeIso = new Date(`${hoy}T00:00:00${AR_OFFSET}`).toISOString()
        const hastaIso = new Date(new Date(desdeIso).getTime() + 86_400_000).toISOString()
        const { data: turnosRaw } = await ctx.db
          .from('wa_turnos')
          .select('id, servicio_id, paciente_nombre, paciente_apellido, paciente_dni, paciente_obra_social')
          .eq('medico_id', ctx.medicoId)
          .eq('paciente_telefono', telefonoNorm)
          .gte('starts_at', desdeIso)
          .lt('starts_at', hastaIso)
          .not('estado', 'in', '(cancelado,ausente)')
          .order('starts_at')
          .limit(3)
        type TurnoHoy = {
          id: string
          servicio_id: string | null
          paciente_nombre: string | null
          paciente_apellido: string | null
          paciente_dni: string | null
          paciente_obra_social: string | null
        }
        const candidatos = ((turnosRaw ?? []) as TurnoHoy[])
        if (candidatos.length === 0) {
          return {
            sin_turno: true,
            mensaje:
              'No encuentro un turno tuyo para hoy desde este número. Si el turno está a nombre de otra persona o lo sacaste por otro medio, avisá en el mostrador 🙌',
          }
        }

        // Del mismo número puede haber más de un turno hoy (madre e hijo): se
        // cobra el primero que aún NO esté pago; si todos están pagos, avisar.
        let turno: TurnoHoy | null = null
        let existente: Awaited<ReturnType<typeof getCobroVivoDeTurno>> = null
        for (const cand of candidatos) {
          const cobro = await getCobroVivoDeTurno(ctx.db, ctx.medicoId, { turnoId: cand.id })
          if (cobro?.estado !== 'cobrado') {
            turno = cand
            existente = cobro
            break
          }
        }
        if (!turno) {
          return { ya_pagado: true, mensaje: 'Tu pago de hoy ya está registrado ✓ El consultorio ya lo ve.' }
        }

        // Día particular (B3): ese día TODOS pagan la consulta completa, tengan
        // la obra social que tengan — mismo criterio que la reserva.
        const { data: diasPart } = await ctx.db
          .from('wa_dias_particulares')
          .select('tipo, dia_semana, fecha')
          .eq('medico_id', ctx.medicoId)
        const esParticular =
          normalizarOs(turno.paciente_obra_social ?? '') === 'particular' ||
          esDiaParticular(((diasPart ?? []) as DiaParticular[]), hoy)
        const concepto: 'plus' | 'consulta_particular' =
          existente?.concepto ?? (esParticular ? 'consulta_particular' : 'plus')
        let monto: number | null = existente ? Number(existente.monto) : null
        if (monto == null) {
          if (esParticular && turno.servicio_id) {
            const { data: serv } = await ctx.db
              .from('wa_servicios')
              .select('precio')
              .eq('id', turno.servicio_id)
              .maybeSingle()
            monto = serv?.precio != null ? Number(serv.precio) : null
          } else if (!esParticular) {
            const { data: cfg } = await ctx.db
              .from('wa_config_agente')
              .select('monto_plus_default')
              .eq('medico_id', ctx.medicoId)
              .maybeSingle()
            monto = cfg?.monto_plus_default != null ? Number(cfg.monto_plus_default) : null
          }
          if (monto == null || monto <= 0) {
            return {
              sin_monto: true,
              mensaje: 'El pago se maneja en el mostrador: avisá en recepción que llegaste 🙌',
            }
          }
        }

        const baseUrl = process.env.PUBLIC_BASE_URL
        if (!baseUrl) return { error: 'El sistema de pagos no está configurado todavía (falta PUBLIC_BASE_URL).' }
        const conexion = await getConexionActiva(ctx.db, ctx.medicoId)
        if (!conexion) return { error: 'El pago online no está disponible por ahora: aboná en el mostrador 🙌' }

        let cobroId = existente?.id ?? null
        if (!cobroId) {
          const cobro = await crearCobro(ctx.db, {
            medicoId: ctx.medicoId,
            concepto,
            monto,
            medio: 'mercadopago',
            estado: 'pendiente',
            turnoId: turno.id,
            pacienteNombre: [turno.paciente_apellido, turno.paciente_nombre].filter(Boolean).join(', ') || null,
            pacienteDni: turno.paciente_dni,
            registradoPor: null, // lo cobró el bot
          })
          if (cobro) {
            cobroId = cobro.id
          } else {
            // Carrera con el mostrador: reintenta con el cobro que ganó el índice único.
            const reintento = await getCobroVivoDeTurno(ctx.db, ctx.medicoId, { turnoId: turno.id })
            if (reintento?.estado === 'cobrado') {
              return { ya_pagado: true, mensaje: 'Tu pago de hoy ya está registrado ✓' }
            }
            if (!reintento) return { error: 'No pude registrar el cobro. Avisá en el mostrador 🙌' }
            cobroId = reintento.id
            monto = Number(reintento.monto)
          }
        }

        const body = buildPreferenciaBodyCobro(
          {
            cobroId,
            titulo: concepto === 'consulta_particular' ? 'Consulta particular' : 'Plus de consulta',
            monto,
            notificationUrl: `${baseUrl}/api/mercadopago/webhook?cobro=${cobroId}`,
          },
          new Date(),
        )
        const pref = await crearPreferencia(conexion.accessToken, body)
        if (!pref) return { error: 'No pude generar el link de pago. Probá de nuevo en unos minutos.' }
        await actualizarPendiente(ctx.db, ctx.medicoId, cobroId, { mpPreferenceId: pref.id })
        return { link: pref.initPoint, monto }
      },
    }),

    solicitar_orden_consulta: tool({
      description:
        'El paciente quiere gestionar su receta por su OBRA SOCIAL (orden de consulta), no pagarla. Llamala cuando lo pida. Si la secretaria está disponible ahora, deriva la conversación a ella; si no, devuelve el aviso de horario. Respondé al paciente con el `mensaje` que devuelve, tal cual.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.secretariaDisponible) {
          return {
            ok: false,
            mensaje:
              'La orden de consulta te la gestiona la secretaria del consultorio, en el horario de atención del médico. Si la querés ahora, la podés pagar acá; si preferís la vía obra social, escribime cuando la secretaria esté disponible 🙌',
          }
        }
        const { error } = await ctx.db
          .from('wa_conversaciones')
          .update({ necesita_humano: true, bot_pausado: true, updated_at: new Date().toISOString() })
          .eq('medico_id', ctx.medicoId)
          .eq('id', ctx.conversacionId)
        if (error) {
          console.error('[wa] solicitar_orden_consulta error:', error.message)
          return { ok: false, mensaje: 'No pude avisar al consultorio. Probá de nuevo en un momento 🙏' }
        }
        await registrarEvento(ctx.db, {
          medicoId: ctx.medicoId,
          origen: 'agente',
          nivel: 'info',
          evento: 'necesita_humano',
          detalle: { motivo: 'orden de consulta OSEP' },
          conversacionId: ctx.conversacionId,
        })
        return {
          ok: true,
          mensaje: 'Perfecto 🙌 Te va a atender la secretaria por este mismo chat para gestionar tu orden de consulta. Aguardá un momento.',
        }
      },
    }),
  }
}
