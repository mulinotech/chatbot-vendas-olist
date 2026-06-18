import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
    name: 'Inpyx_assistant',
    description: 'Um chatbot de vendas e atendimento personalizado para a Herrmann Health (Bila)',

    defaultModels: {
        autonomous: 'openai:gpt-4o',
        zai: 'openai:gpt-4o-mini',
    },

    // Per-bot persistent state
    bot: {
        state: z.object({}),
    },

    // Per-user persistent state
    user: {
        state: z.object({
            ultimaCamada: z.string().nullable().optional(),
            dadosColetados: z.object({
                categoria: z.string().optional(),
                sintomaObjetivo: z.string().optional(),
                medicamentos: z.string().optional(),
                alergias: z.string().optional(),
                idade: z.number().optional(),
                lactanteGestante: z.string().optional(), // 'sim' ou 'nao'
                experienciaNatural: z.string().optional(),
                condicaoGrave: z.boolean().optional(),
                preferencias: z.record(z.any()).optional()
            }).passthrough().optional(),
            carrinho: z.array(z.object({
                sku: z.string(),
                name: z.string(),
                price: z.number(),
                quantity: z.number()
            })).optional(),
            pendingAudioUrl: z.string().nullable().optional(),
        }),
    },

    // Integrations extend your agent with actions, channels, and events.
    dependencies: {
        "integrations": {
            "chat": "chat@1.0.0",
            "webchat": "webchat@0.3.0"
        }
    },
})

