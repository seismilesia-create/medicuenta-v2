import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const MODELS = {
  free: 'google/gemini-2.5-flash-lite',
  balanced: 'google/gemini-2.5-flash-lite',
} as const
