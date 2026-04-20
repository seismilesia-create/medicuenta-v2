import { openrouter, MODELS } from '@/lib/ai/openrouter'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { SYSTEM_PROMPT } from '@/features/assistant/config/systemPrompt'
import { PLATFORM_KNOWLEDGE } from '@/features/assistant/config/platformKnowledge'
import { assistantTools } from '@/features/assistant/config/tools'

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: openrouter(MODELS.agent),
    system: `${SYSTEM_PROMPT}\n\n${PLATFORM_KNOWLEDGE}`,
    messages: modelMessages,
    tools: assistantTools,
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
