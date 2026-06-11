import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const MODELS = {
  // Modelo principal del asistente (chat + tool-calling): Gemini 3.5 Flash.
  // Decisión del dueño (2026-06-11) tras la prueba en vivo de Fase 3A: Haiku 4.5
  // quedó chico para la orquestación (confirmaba turnos sin llamar reservar_turno,
  // decía "ya avisé" sin llamar avisar_consultorio, partía mal nombre/apellido).
  // Criterio de producto: IA sobrada antes que justa — no quemarse con los médicos.
  agent: 'google/gemini-3.5-flash',
  // Visión / OCR (recetas y órdenes) — sigue en Haiku: validado E2E en Fase 1, no se toca.
  vision: 'anthropic/claude-haiku-4.5',
  // Alternativas SOLO para A/B testing vía ASSISTANT_MODEL (no se usan por defecto):
  agentHaiku: 'anthropic/claude-haiku-4.5',
  agentDeepseek: 'deepseek/deepseek-v4-flash',
} as const

/**
 * Resuelve el modelo del asistente según ASSISTANT_MODEL (.env.local).
 * Por defecto: Gemini 3.5 Flash. Para comparar sin tocar código:
 *   - "haiku"    → Claude Haiku 4.5 (el modelo anterior)
 *   - "deepseek" → DeepSeek V4 Flash
 * Requiere reiniciar el dev server tras cambiar la env var.
 */
export function getAgentModel() {
  switch (process.env.ASSISTANT_MODEL?.toLowerCase()) {
    case 'haiku':
      return MODELS.agentHaiku
    case 'deepseek':
      return MODELS.agentDeepseek
    default:
      return MODELS.agent
  }
}
