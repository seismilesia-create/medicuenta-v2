import { generateText } from 'ai'
import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import type { HistorialMsg } from '@/features/whatsapp/services/conversaciones'

export interface AgentDeps {
  medicoId: string // inyectado (no hay sesión en el webhook). Las tools de Fase 1 lo usarán.
}

/**
 * Corre un turno del agente y devuelve el texto de respuesta.
 * Fase 0: sin tools (solo conversación). En Fase 1 se agregan tools de cobro.
 */
export async function runAgentTurn(opts: {
  systemPrompt: string
  historial: HistorialMsg[]
  // deps queda reservado para Fase 1 (tools que reciben medicoId).
  deps?: AgentDeps
}): Promise<string> {
  const result = await generateText({
    model: openrouter(getAgentModel()),
    system: opts.systemPrompt,
    messages: opts.historial,
  })
  return result.text.trim()
}
