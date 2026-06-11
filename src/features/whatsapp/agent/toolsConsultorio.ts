import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarEvento } from '@/features/whatsapp/services/bitacora'

export interface ConsultorioToolsCtx {
  db: SupabaseClient
  medicoId: string
  conversacionId: string | null
}

/** Tool de alarma (spec Fase 3 D6/§6): el bot levanta la mano; el panel la atiende. */
export function buildConsultorioTools(ctx: ConsultorioToolsCtx) {
  return {
    avisar_consultorio: tool({
      description:
        'Avisa al consultorio que esta conversación necesita atención HUMANA. Usala cuando el paciente pida hablar con una persona, esté disconforme/enojado, o no puedas resolver lo que necesita con tus otras tools.',
      inputSchema: z.object({
        motivo: z.string().describe('Motivo breve del aviso, tal como lo entendés (ej. "pide hablar con una persona").'),
      }),
      execute: async ({ motivo }) => {
        if (!ctx.conversacionId) {
          // Sin hilo no hay flag que encender, pero el aviso queda en la bitácora:
          // jamás decirle al paciente "ya avisé" sin haber registrado nada.
          await registrarEvento(ctx.db, {
            medicoId: ctx.medicoId,
            origen: 'agente',
            nivel: 'info',
            evento: 'necesita_humano',
            detalle: { motivo: motivo.trim().slice(0, 200), sin_conversacion: true },
          })
          return { ok: true, mensaje: 'Aviso registrado. Decile que el consultorio fue notificado y le van a responder por acá.' }
        }
        const { error } = await ctx.db
          .from('wa_conversaciones')
          .update({ necesita_humano: true, updated_at: new Date().toISOString() })
          .eq('medico_id', ctx.medicoId)
          .eq('id', ctx.conversacionId)
        if (error) {
          console.error('[wa] avisar_consultorio error:', error.message)
          return { ok: false, error: 'No pude registrar el aviso. Decile al paciente que reintente en unos minutos.' }
        }
        await registrarEvento(ctx.db, {
          medicoId: ctx.medicoId,
          origen: 'agente',
          nivel: 'info',
          evento: 'necesita_humano',
          detalle: { motivo: motivo.trim().slice(0, 200) },
          conversacionId: ctx.conversacionId,
        })
        return {
          ok: true,
          mensaje: 'Aviso registrado. Decile al paciente que el consultorio ya fue notificado y le van a responder por este mismo chat.',
        }
      },
    }),
  }
}
