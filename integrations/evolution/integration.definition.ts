import { IntegrationDefinition, messages, z } from '@botpress/sdk'

// Integração WhatsApp via Evolution API (v2) para os bots da MulinoTech.
// Para usar com outro cliente, basta instalar no bot e preencher a configuração com a instância dele.
// O nome precisa do "handle" do workspace do Botpress como prefixo (ex: mulinotech/evolution).
export default new IntegrationDefinition({
  name: 'mulinotech/evolution',
  version: '0.1.4',
  title: 'WhatsApp (Evolution API)',
  description: 'Envia e recebe mensagens de WhatsApp através de uma instância da Evolution API v2, com transcrição de áudios recebidos.',
  readme: 'hub.md',
  icon: 'icon.svg',

  configuration: {
    schema: z.object({
      baseUrl: z.string().title('URL da Evolution API').describe('Endereço do servidor, ex: https://eapi.seudominio.com (sem /manager)'),
      apiKey: z.string().secret().title('API Key').describe('API key global ou da instância'),
      instance: z.string().title('Instância').describe('Nome da instância conectada ao número de WhatsApp'),
      elevenLabsApiKey: z
        .string()
        .secret()
        .optional()
        .title('Chave ElevenLabs (opcional)')
        .describe('Usada para transcrever as mensagens de voz recebidas. Sem ela, o bot só recebe um aviso de que chegou um áudio.'),
      typingDelay: z
        .boolean()
        .default(true)
        .title('Simular digitação')
        .describe('Mostra "digitando..." por alguns segundos antes de cada mensagem, deixando a conversa mais humana'),
    }),
  },

  channels: {
    channel: {
      title: 'WhatsApp',
      messages: { ...messages.defaults },
      message: { tags: { id: { title: 'ID da mensagem no WhatsApp' } } },
      conversation: { tags: { remoteJid: { title: 'JID do contato no WhatsApp' } } },
    },
  },

  user: {
    tags: {
      remoteJid: { title: 'JID do contato no WhatsApp' },
      phone: { title: 'Telefone' },
    },
  },
})
