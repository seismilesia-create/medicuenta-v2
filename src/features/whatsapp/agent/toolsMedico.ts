import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resumenTurnos } from '@/features/whatsapp/services/turnosService'
import { resumenRecetas } from '@/features/whatsapp/services/recetasService'
import { setPrecioReceta } from '@/features/whatsapp/services/configAgente'
import { PLATFORM_KNOWLEDGE } from '@/features/assistant/config/platformKnowledge'

export interface MedicoToolsCtx {
  db: SupabaseClient
  medicoId: string
}

/** Tools del agente que atiende al MÉDICO por WhatsApp. medico_id INYECTADO (webhook sin sesión). */
export function buildMedicoTools(ctx: MedicoToolsCtx) {
  return {
    consultar_agenda: tool({
      description: 'Muestra la agenda de turnos de los próximos 7 días del médico.',
      inputSchema: z.object({}),
      execute: async () => ({ resumen: await resumenTurnos(ctx.db, ctx.medicoId) }),
    }),

    estado_recetas: tool({
      description: 'Muestra el estado de las recetas cargadas por el médico (pendientes, pagadas, entregadas).',
      inputSchema: z.object({}),
      execute: async () => ({ resumen: await resumenRecetas(ctx.db, ctx.medicoId) }),
    }),

    fijar_precio_receta: tool({
      description:
        'Fija el monto que se le cobra al paciente por gestionar cada receta. CONFIRMÁ el monto con el médico ANTES de llamar a esta tool.',
      inputSchema: z.object({ monto: z.number().describe('Monto en pesos, ej: 5000') }),
      execute: async ({ monto }) => {
        if (!Number.isFinite(monto) || monto <= 0) return { error: 'El monto tiene que ser un número mayor a cero.' }
        await setPrecioReceta(ctx.db, ctx.medicoId, monto)
        return { ok: true as const, monto }
      },
    }),

    ayuda_plataforma: tool({
      description: 'Responde dudas del médico sobre cómo usar MediCuenta (la app).',
      inputSchema: z.object({ tema: z.string().describe('Sobre qué pregunta el médico') }),
      execute: async () => ({ info: PLATFORM_KNOWLEDGE }),
    }),
  }
}
