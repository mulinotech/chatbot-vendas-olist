import { IntegrationDefinition, z } from '@botpress/sdk'
import llm from './bp_modules/llm'

// Provedor de IA para o Botpress usando a chave própria do Google AI Studio (Gemini).
// O custo sai da conta do Google, não do "AI spend" do Botpress.
export default new IntegrationDefinition({
  name: 'mulinotech/gemini',
  version: '0.1.1',
  title: 'Gemini (chave própria)',
  description: 'Usa modelos Gemini do Google AI Studio com a sua própria chave de API como cérebro do bot.',
  readme: 'hub.md',
  icon: 'icon.svg',

  configuration: {
    schema: z.object({
      apiKey: z.string().secret().title('Chave da API Gemini').describe('Chave criada no Google AI Studio (de preferência num projeto com faturamento ativo)'),
    }),
  },

  entities: {
    modelRef: {
      schema: z.object({ id: z.string() }),
    },
  },
}).extend(llm, ({ entities }) => ({
  entities: { modelRef: entities.modelRef },
  // A cobrança é feita na conta do Google (chave própria), não pelo Botpress.
  // Sem isto o Botpress recusa a chamada: "Integration ... is not authorized for billing".
  actions: { generateContent: { billable: false } },
}))
