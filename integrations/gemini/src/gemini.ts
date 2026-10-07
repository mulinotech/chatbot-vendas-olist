import { DEFAULT_MODEL_ID, MODELS } from './models'

// Tradução entre o formato de LLM do Botpress e o endpoint compatível com OpenAI do Gemini.
// https://ai.google.dev/gemini-api/docs/openai

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: Record<string, any> | null } }
type ContentPart = { type: 'text' | 'image'; mimeType?: string; text?: string; url?: string }

export type LlmInput = {
  model?: { id: string }
  reasoningEffort?: 'low' | 'medium' | 'high' | 'dynamic' | 'none'
  systemPrompt?: string
  messages: {
    role: 'user' | 'assistant'
    type?: 'text' | 'tool_calls' | 'tool_result' | 'multipart'
    toolCalls?: ToolCall[]
    toolResultCallId?: string
    content: string | ContentPart[] | null
  }[]
  responseFormat?: 'text' | 'json_object'
  maxTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  tools?: { type: 'function'; function: { name: string; description?: string; argumentsSchema?: Record<string, any> } }[]
  toolChoice?: { type?: 'auto' | 'specific' | 'any' | 'none' | ''; functionName?: string }
}

// O Gemini 3 exige devolver a "thought signature" de cada chamada de ferramenta.
// Como o formato do Botpress não tem esse campo, ela viaja embutida no ID da chamada.
const SIGNATURE_SEPARATOR = '|ts:'
const SKIP_SIGNATURE = 'skip_thought_signature_validator' // valor aceito pelo Google quando não há assinatura
const splitCallId = (id: string) => {
  const [baseId, signature] = id.split(SIGNATURE_SEPARATOR)
  return { baseId: baseId ?? id, signature }
}

const toOpenAiContent = (content: string | ContentPart[] | null) => {
  if (content == null || typeof content === 'string') return content ?? ''
  return content.map((part) =>
    part.type === 'image' ? { type: 'image_url', image_url: { url: part.url } } : { type: 'text', text: part.text ?? '' }
  )
}

export function buildRequest(input: LlmInput) {
  const modelId = input.model?.id ?? DEFAULT_MODEL_ID
  const messages: any[] = []
  if (input.systemPrompt) messages.push({ role: 'system', content: input.systemPrompt })

  for (const m of input.messages) {
    if (m.type === 'tool_calls' && m.toolCalls) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: m.toolCalls.map((c) => {
          const { baseId, signature } = splitCallId(c.id)
          return {
            id: baseId,
            type: 'function',
            function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments ?? {}) },
            extra_content: { google: { thought_signature: signature ?? SKIP_SIGNATURE } },
          }
        }),
      })
    } else if (m.type === 'tool_result') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolResultCallId ? splitCallId(m.toolResultCallId).baseId : undefined,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })
    } else {
      messages.push({ role: m.role, content: toOpenAiContent(m.content) })
    }
  }

  const body: Record<string, any> = {
    model: modelId,
    messages,
    temperature: input.temperature,
    top_p: input.topP,
    max_tokens: input.maxTokens,
    stop: input.stopSequences?.length ? input.stopSequences : undefined,
  }

  // Sem "reasoningEffort" informado, o raciocínio fica desligado (respostas rápidas e sem vazar rascunho)
  const effort = input.reasoningEffort ?? 'none'
  if (effort !== 'dynamic') body.reasoning_effort = effort

  if (input.responseFormat === 'json_object') body.response_format = { type: 'json_object' }

  if (input.tools?.length) {
    body.tools = input.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.argumentsSchema ?? { type: 'object', properties: {} },
      },
    }))
    const choice = input.toolChoice?.type
    if (choice === 'any') body.tool_choice = 'required'
    else if (choice === 'none') body.tool_choice = 'none'
    else if (choice === 'specific' && input.toolChoice?.functionName)
      body.tool_choice = { type: 'function', function: { name: input.toolChoice.functionName } }
    else body.tool_choice = 'auto'
  }

  return { modelId, body }
}

const STOP_REASONS: Record<string, 'stop' | 'max_tokens' | 'tool_calls' | 'content_filter' | 'other'> = {
  stop: 'stop',
  length: 'max_tokens',
  tool_calls: 'tool_calls',
  content_filter: 'content_filter',
}

const parseArgs = (raw: string | undefined) => {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return null
  }
}

export async function generateContent(apiKey: string, input: LlmInput) {
  const { modelId, body } = buildRequest(input)

  // Até 3 tentativas para erros temporários (limite de taxa ou instabilidade do Google)
  let res: Response | undefined
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status !== 429 && res.status < 500) break
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500))
  }

  const data: any = await res!.json().catch(() => ({}))
  if (!res!.ok) {
    const message = Array.isArray(data) ? data[0]?.error?.message : data.error?.message
    throw new Error(`Gemini retornou ${res!.status}: ${message ?? JSON.stringify(data).slice(0, 300)}`)
  }

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]!
  const inputTokens = data.usage?.prompt_tokens ?? 0
  const outputTokens = data.usage?.completion_tokens ?? 0
  const inputCost = (inputTokens / 1_000_000) * model.input.costPer1MTokens
  const outputCost = (outputTokens / 1_000_000) * model.output.costPer1MTokens

  return {
    id: data.id ?? `gemini-${Date.now()}`,
    provider: 'google-ai-studio',
    model: modelId,
    choices: (data.choices ?? []).map((choice: any, index: number) => {
      const toolCalls = choice.message?.tool_calls as any[] | undefined
      const stopReason = STOP_REASONS[choice.finish_reason] ?? 'other'
      if (toolCalls?.length) {
        return {
          role: 'assistant' as const,
          index,
          type: 'tool_calls' as const,
          content: null,
          stopReason: 'tool_calls' as const,
          toolCalls: toolCalls.map((c, i) => ({
            id: [c.id ?? `call_${index}_${i}`, c.extra_content?.google?.thought_signature].filter(Boolean).join(SIGNATURE_SEPARATOR),
            type: 'function' as const,
            function: { name: c.function?.name, arguments: parseArgs(c.function?.arguments) },
          })),
        }
      }
      return { role: 'assistant' as const, index, type: 'text' as const, content: choice.message?.content ?? '', stopReason }
    }),
    usage: { inputTokens, inputCost, outputTokens, outputCost },
    // Custo cobrado pelo Botpress: zero, pois a cobrança é feita na conta do Google
    botpress: { cost: 0 },
  }
}
