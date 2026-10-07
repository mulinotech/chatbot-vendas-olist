import * as bp from '.botpress'
import { generateContent } from './gemini'
import { MODELS } from './models'

export default new bp.Integration({
  register: async ({ ctx }) => {
    // Valida a chave ao salvar a configuração
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': ctx.configuration.apiKey },
    })
    if (!res.ok) {
      throw new Error(`Chave da API Gemini inválida ou sem acesso (status ${res.status})`)
    }
  },
  unregister: async () => {},

  actions: {
    generateContent: async ({ ctx, input, logger }) => {
      try {
        return (await generateContent(ctx.configuration.apiKey, input as any)) as any
      } catch (err) {
        logger.forBot().error(`[gemini] ${String(err)}`)
        throw err
      }
    },
    listLanguageModels: async () => ({ models: MODELS }),
  },

  channels: {},
  handler: async () => {},
})
