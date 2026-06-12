import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registro del COSTO de IA por médico (spec dashboard §5.1). Guarda los tokens
 * de cada turno de los asistentes (WhatsApp y facturación) en `uso_ia`, para que
 * el dueño vea cuánto le cuesta cada médico y detecte outliers.
 * NUNCA lanza: un fallo de instrumentación no puede afectar el flujo.
 */

/** Forma del `usage` del AI SDK v6 (campos opcionales). */
export interface UsageLike {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface UsoNormalizado {
  input: number
  output: number
  total: number
}

/** Normaliza el usage a enteros ≥0; si falta totalTokens, suma input+output. */
export function normalizarUsage(u: UsageLike | undefined | null): UsoNormalizado {
  const input = Math.max(0, Math.round(u?.inputTokens ?? 0))
  const output = Math.max(0, Math.round(u?.outputTokens ?? 0))
  const total = u?.totalTokens != null ? Math.max(0, Math.round(u.totalTokens)) : input + output
  return { input, output, total }
}

export async function registrarUsoIa(
  db: SupabaseClient,
  args: {
    medicoId: string
    origen: 'whatsapp' | 'panel'
    modelo?: string | null
    usage?: UsageLike | null
    conversacionId?: string | null
  },
): Promise<void> {
  try {
    const u = normalizarUsage(args.usage)
    if (u.total === 0) return // sin datos de tokens: no registramos ruido
    const { error } = await db.from('uso_ia').insert({
      medico_id: args.medicoId,
      origen: args.origen,
      modelo: args.modelo ?? null,
      input_tokens: u.input,
      output_tokens: u.output,
      total_tokens: u.total,
      conversacion_id: args.conversacionId ?? null,
    })
    if (error) console.error('[uso_ia] insert error:', error.message)
  } catch (e) {
    console.error('[uso_ia] error inesperado:', e)
  }
}
