import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const MODELS = {
  // Modelo principal del asistente (chat + tool-calling): Claude Haiku 4.5.
  // Claude = tool-calling muy confiable (sin llamadas malformadas) y soporta visión.
  agent: 'anthropic/claude-haiku-4.5',
  // Visión / OCR (escaneo de órdenes en papel) — también Haiku.
  vision: 'anthropic/claude-haiku-4.5',
  // Alternativas SOLO para A/B testing vía ASSISTANT_MODEL (no se usan por defecto):
  agentGemini: 'google/gemini-2.5-flash',
  agentDeepseek: 'deepseek/deepseek-v4-flash',
} as const

/**
 * Resuelve el modelo del asistente según ASSISTANT_MODEL (.env.local).
 * Por defecto: Claude Haiku 4.5. Para comparar sin tocar código:
 *   - "gemini"   → Gemini 2.5 Flash
 *   - "deepseek" → DeepSeek V4 Flash
 * Requiere reiniciar el dev server tras cambiar la env var.
 */
export function getAgentModel() {
  switch (process.env.ASSISTANT_MODEL?.toLowerCase()) {
    case 'gemini':
      return MODELS.agentGemini
    case 'deepseek':
      return MODELS.agentDeepseek
    default:
      return MODELS.agent
  }
}
