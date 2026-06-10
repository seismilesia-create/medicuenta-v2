import { generateText, stepCountIs, type ToolSet } from 'ai'
import { openrouter, getAgentModel } from '@/lib/ai/openrouter'
import type { HistorialMsg } from '@/features/whatsapp/services/conversaciones'
import type { CobroGenerado } from './sanitizarReply'

export interface AgentTurnResult {
  text: string
  /** Links de pago generados DE VERDAD por cobrar_receta en este turno. */
  cobros: CobroGenerado[]
}

/**
 * Corre un turno del agente del paciente. Las tools llevan el medico_id inyectado
 * (no hay sesión en el webhook). stopWhen limita el loop de tools del SDK.
 * Devuelve además los cobros reales del turno para la barrera anti-links-inventados.
 */
export async function runAgentTurn(opts: {
  systemPrompt: string
  historial: HistorialMsg[]
  tools?: ToolSet
}): Promise<AgentTurnResult> {
  const result = await generateText({
    model: openrouter(getAgentModel()),
    system: opts.systemPrompt,
    messages: opts.historial,
    tools: opts.tools,
    stopWhen: stepCountIs(5),
  })

  const cobros: CobroGenerado[] = []
  for (const step of result.steps) {
    for (const tr of step.toolResults) {
      if (tr.toolName !== 'cobrar_receta') continue
      const out = tr.output as { link?: string; monto?: number } | undefined
      if (out?.link) cobros.push({ link: out.link, monto: Number(out.monto ?? 0) })
    }
  }

  const toolsUsadas = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
  console.log(`[wa] agente steps=${result.steps.length} tools=[${toolsUsadas.join(',')}] cobros=${cobros.length}`)

  return { text: result.text.trim(), cobros }
}
