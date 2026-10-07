// Modelos oferecidos ao Botpress. Preços por 1 milhão de tokens em US$ (estimativas, conferir no Google AI Studio).
// "thinking" desligado por padrão: no chat, respostas rápidas valem mais que raciocínio longo.

export type GeminiModel = {
  id: string
  name: string
  description: string
  tags: ('recommended' | 'general-purpose' | 'low-cost' | 'vision' | 'function-calling' | 'agents' | 'reasoning' | 'preview')[]
  input: { maxTokens: number; costPer1MTokens: number }
  output: { maxTokens: number; costPer1MTokens: number }
}

export const DEFAULT_MODEL_ID = 'gemini-3.5-flash'

export const MODELS: GeminiModel[] = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    description: 'Rápido e inteligente, ótimo equilíbrio para atendimento em tempo real.',
    tags: ['recommended', 'general-purpose', 'vision', 'function-calling', 'agents'],
    input: { maxTokens: 1_048_576, costPer1MTokens: 0.5 },
    output: { maxTokens: 65_536, costPer1MTokens: 3 },
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Modelo estável, rápido e de baixo custo.',
    tags: ['general-purpose', 'low-cost', 'vision', 'function-calling', 'agents'],
    input: { maxTokens: 1_048_576, costPer1MTokens: 0.3 },
    output: { maxTokens: 65_536, costPer1MTokens: 2.5 },
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    description: 'O mais econômico, para tarefas simples.',
    tags: ['low-cost', 'general-purpose'],
    input: { maxTokens: 1_048_576, costPer1MTokens: 0.1 },
    output: { maxTokens: 65_536, costPer1MTokens: 0.4 },
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Econômico e estável, para tarefas simples.',
    tags: ['low-cost', 'general-purpose'],
    input: { maxTokens: 1_048_576, costPer1MTokens: 0.1 },
    output: { maxTokens: 65_536, costPer1MTokens: 0.4 },
  },
]
