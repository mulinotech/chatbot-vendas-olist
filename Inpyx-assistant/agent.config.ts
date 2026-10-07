import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
    name: 'Inpyx_assistant',
    description: 'Um chatbot de vendas e atendimento personalizado para a Herrmann Health (Bila)',

    defaultModels: {
        // Modelo da Bila: defina BILA_MODEL no .env (ex: gemini:gemini-3.5-flash ou openai:gpt-4o).
        // Gemini usa a chave própria do Google AI Studio; os modelos openai:* consomem o crédito do Botpress.
        // Se o modelo principal falhar, a conversa tenta de novo com o GPT-4o (src/conversations/index.ts).
        autonomous: (process.env.BILA_MODEL || 'gemini:gemini-3.5-flash') as any,
        zai: ['gemini:gemini-2.5-flash', 'openai:gpt-4o-mini'],
    },

    // Credenciais do aplicativo API V3 do Tiny (definir com: adk secret:set NOME valor [--prod])
    secrets: {
        TINY_CLIENT_ID: { description: 'Client ID do aplicativo API V3 no Tiny/Olist ERP' },
        TINY_CLIENT_SECRET: { description: 'Client Secret do aplicativo API V3 no Tiny/Olist ERP' },
        TINY_REFRESH_TOKEN: {
            optional: true,
            description: 'Refresh token inicial gerado por scripts/tiny-auth.mjs (o bot renova sozinho depois)',
        },
        ELEVENLABS_API_KEY: { description: 'Chave da API da ElevenLabs usada nas respostas em áudio' },
    },

    // Per-bot persistent state
    bot: {
        state: z.object({
            // Tokens OAuth do Tiny, renovados automaticamente pelo bot
            tiny: z.object({
                accessToken: z.string().nullable(),
                refreshToken: z.string(),
                accessExpiresAt: z.number(),
                refreshExpiresAt: z.number(),
                seededFrom: z.string().optional(), // final do refresh token do segredo usado como semente
            }).nullable().optional(),
            catalogSync: z.object({
                startedAt: z.string().nullable().optional(),
                finishedAt: z.string().nullable().optional(),
                status: z.string().optional(),
                productCount: z.number().optional(),
                error: z.string().nullable().optional(),
            }).optional(),
        }),
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
            pendingDocument: z.object({ url: z.string(), title: z.string() }).nullable().optional(),
            nomeCliente: z.string().nullable().optional(), // nome real do cliente, salvo pela tool salvarNomeCliente
        }),
    },

    // Integrations extend your agent with actions, channels, and events.
    dependencies: {
        "integrations": {
            "chat": "chat@1.0.0",
            "webchat": "webchat@0.3.0",
            // Cérebro da Bila: Gemini com a chave do .env (GEMINI_API_KEY)
            "gemini": {
                version: "mulinotech/gemini@0.1.1",
                enabled: Boolean(process.env.GEMINI_API_KEY),
                config: { apiKey: process.env.GEMINI_API_KEY ?? '' },
            },
            // WhatsApp via Evolution API: a configuração vem do .env no momento do build/deploy
            "evolution": {
                version: "mulinotech/evolution@0.1.4",
                enabled: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE),
                config: {
                    baseUrl: process.env.EVOLUTION_API_URL ?? '',
                    apiKey: process.env.EVOLUTION_API_KEY ?? '',
                    instance: process.env.EVOLUTION_INSTANCE ?? '',
                    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
                    typingDelay: true,
                },
            }
        }
    },
})

