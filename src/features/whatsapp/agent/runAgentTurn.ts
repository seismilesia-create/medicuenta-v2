import { generateText, stepCountIs, type ToolSet } from 'ai'
import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import type { HistorialMsg } from '@/features/whatsapp/services/conversaciones'

/**
 * Corre un turno del agente del paciente. Las tools llevan el medico_id inyectado
 * (no hay sesión en el webhook). stopWhen limita el loop de tools del SDK.
 */
export async function runAgentTurn(opts: {
  systemPrompt: string
  historial: HistorialMsg[]
  tools?: ToolSet
}): Promise<string> {
  const result = await generateText({
    model: openrouter(getAgentModel()),
    system: opts.systemPrompt,
    messages: opts.historial,
    tools: opts.tools,
    stopWhen: stepCountIs(5),
  })
  return result.text.trim()
}
