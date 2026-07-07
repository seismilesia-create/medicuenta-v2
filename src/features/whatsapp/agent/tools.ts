import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecipient } from '@/lib/whatsapp/client'
import { buildPreferenciaBody, crearPreferencia } from '@/lib/mercadopago/client'
import { getConexionActiva } from '@/features/whatsapp/services/mpConexiones'
import {
  buscarPendientesPorIdentidad,
  getRecetaDelMedico,
  vincularPago,
  type RecetaRow,
} from '@/features/whatsapp/services/recetasService'

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
        if (!vinculado) {
          return {
            error:
              'Esa receta ya está siendo gestionada desde otro número de WhatsApp. Si sos el paciente, avisale a tu médico para que lo verifique.',
          }
        }
        return { link: pref.initPoint, monto: Number(receta.monto) }
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
          .update({ necesita_humano: true, updated_at: new Date().toISOString() })
          .eq('medico_id', ctx.medicoId)
          .eq('id', ctx.conversacionId)
        if (error) {
          console.error('[wa] solicitar_orden_consulta error:', error.message)
          return { ok: false, mensaje: 'No pude avisar al consultorio. Probá de nuevo en un momento 🙏' }
        }
        return {
          ok: true,
          mensaje: 'Perfecto 🙌 Te va a atender la secretaria por este mismo chat para gestionar tu orden de consulta. Aguardá un momento.',
        }
      },
    }),
  }
}
