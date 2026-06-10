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
    // 7 = margen para el flujo mixto recetas+turnos (buscar→cobrar→consultar→reservar→
    // texto, más un reintento); con 5, una reserva podía ejecutarse en el último step
    // y el turno quedaba mudo.
    stopWhen: stepCountIs(7),
  })

  const cobros: CobroGenerado[] = []
  // Anti-mudez: si el modelo gastó el último step en una tool CON EFECTO (reservó o
  // canceló) y no llegó a redactar texto, el paciente igual tiene que enterarse.
  let fallbackConEfecto = ''
  for (const step of result.steps) {
    for (const tr of step.toolResults) {
      if (tr.toolName === 'cobrar_receta') {
        const out = tr.output as { link?: string; monto?: number } | undefined
        if (out?.link) cobros.push({ link: out.link, monto: Number(out.monto ?? 0) })
      }
      if (tr.toolName === 'reservar_turno' || tr.toolName === 'cancelar_turno') {
        const out = tr.output as { ok?: boolean; mensaje?: string } | undefined
        if (out?.ok && out.mensaje) fallbackConEfecto = out.mensaje
      }
    }
  }

  const toolsUsadas = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
  console.log(`[wa] agente steps=${result.steps.length} tools=[${toolsUsadas.join(',')}] cobros=${cobros.length}`)

  return { text: result.text.trim() || fallbackConEfecto, cobros }
}
