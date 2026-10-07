import { createHash } from 'crypto'
import * as bp from '.botpress'
import { EvolutionClient, markdownToWhatsApp, typingDelayFor } from './evolution'
import { transcribeAudio } from './transcription'

type Config = bp.configuration.Configuration

const evolution = (config: Config) => new EvolutionClient(config)

// Token incluído na URL do webhook para garantir que só a Evolution consiga postar nele
const webhookToken = (config: Config) =>
  createHash('sha256').update(`${config.instance}:${config.apiKey}`).digest('hex').slice(0, 32)

const webhookUrlWithToken = (webhookUrl: string, config: Config) => `${webhookUrl}?token=${webhookToken(config)}`

const delayFor = (config: Config, text: string) => (config.typingDelay === false ? undefined : typingDelayFor(text))

/** Número de destino a partir das tags da conversa (JID completo é aceito pela Evolution). */
const targetOf = (conversation: { tags: { remoteJid?: string } }) => {
  const jid = conversation.tags.remoteJid
  if (!jid) throw new Error('Conversa sem remoteJid')
  return jid
}

type Option = { label: string; value: string }
const optionsAsText = (text: string, options: Option[]) =>
  [markdownToWhatsApp(text), '', ...options.map((o, i) => `*${i + 1}.* ${o.label}`)].join('\n')

type CardPayload = bp.channels.channel.card.Card
async function sendCard(client: EvolutionClient, config: Config, number: string, card: CardPayload) {
  const lines = [`*${card.title}*`, card.subtitle ?? '']
  for (const action of card.actions) {
    lines.push(action.action === 'url' ? `🔗 ${action.label}: ${action.value}` : `• ${action.label}`)
  }
  const caption = lines.filter(Boolean).join('\n')
  if (card.imageUrl) {
    await client.sendMedia(number, { mediatype: 'image', url: card.imageUrl, caption }, delayFor(config, caption))
  } else {
    await client.sendText(number, caption, delayFor(config, caption))
  }
}

export default new bp.Integration({
  register: async ({ ctx, webhookUrl, logger }) => {
    await evolution(ctx.configuration).setWebhook(webhookUrlWithToken(webhookUrl, ctx.configuration), true)
    logger.forBot().info(`Webhook configurado na instância ${ctx.configuration.instance} da Evolution API`)
  },

  unregister: async ({ ctx, webhookUrl, logger }) => {
    try {
      await evolution(ctx.configuration).setWebhook(webhookUrlWithToken(webhookUrl, ctx.configuration), false)
    } catch (err) {
      logger.forBot().warn(`Não foi possível desativar o webhook na Evolution: ${String(err)}`)
    }
  },

  actions: {},

  channels: {
    channel: {
      messages: {
        text: async ({ ctx, conversation, payload, ack }) => {
          const text = markdownToWhatsApp(payload.text)
          const sent = await evolution(ctx.configuration).sendText(targetOf(conversation), text, delayFor(ctx.configuration, text))
          await ack({ tags: { id: sent?.key?.id } })
        },
        image: async ({ ctx, conversation, payload, ack }) => {
          const sent = await evolution(ctx.configuration).sendMedia(targetOf(conversation), { mediatype: 'image', url: payload.imageUrl })
          await ack({ tags: { id: sent?.key?.id } })
        },
        audio: async ({ ctx, conversation, payload, ack }) => {
          // "Gravando áudio..." por 1s deixa a mensagem de voz mais natural
          const delay = ctx.configuration.typingDelay === false ? undefined : 1000
          const sent = await evolution(ctx.configuration).sendAudio(targetOf(conversation), payload.audioUrl, delay)
          await ack({ tags: { id: sent?.key?.id } })
        },
        video: async ({ ctx, conversation, payload, ack }) => {
          const sent = await evolution(ctx.configuration).sendMedia(targetOf(conversation), { mediatype: 'video', url: payload.videoUrl })
          await ack({ tags: { id: sent?.key?.id } })
        },
        file: async ({ ctx, conversation, payload, ack }) => {
          const sent = await evolution(ctx.configuration).sendMedia(targetOf(conversation), {
            mediatype: 'document',
            url: payload.fileUrl,
            fileName: payload.title,
            mimetype: payload.title?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined,
          })
          await ack({ tags: { id: sent?.key?.id } })
        },
        location: async ({ ctx, conversation, payload, ack }) => {
          const sent = await evolution(ctx.configuration).sendLocation(targetOf(conversation), {
            latitude: payload.latitude,
            longitude: payload.longitude,
            name: payload.title,
            address: payload.address,
          })
          await ack({ tags: { id: sent?.key?.id } })
        },
        choice: async ({ ctx, conversation, payload, ack }) => {
          const text = optionsAsText(payload.text, payload.options)
          const sent = await evolution(ctx.configuration).sendText(targetOf(conversation), text, delayFor(ctx.configuration, text))
          await ack({ tags: { id: sent?.key?.id } })
        },
        dropdown: async ({ ctx, conversation, payload, ack }) => {
          const text = optionsAsText(payload.text, payload.options)
          const sent = await evolution(ctx.configuration).sendText(targetOf(conversation), text, delayFor(ctx.configuration, text))
          await ack({ tags: { id: sent?.key?.id } })
        },
        card: async ({ ctx, conversation, payload, ack }) => {
          await sendCard(evolution(ctx.configuration), ctx.configuration, targetOf(conversation), payload)
          await ack({ tags: {} })
        },
        carousel: async ({ ctx, conversation, payload, ack }) => {
          const client = evolution(ctx.configuration)
          for (const card of payload.items) {
            await sendCard(client, ctx.configuration, targetOf(conversation), card)
          }
          await ack({ tags: {} })
        },
        bloc: async ({ ctx, conversation, payload, ack }) => {
          const client = evolution(ctx.configuration)
          const number = targetOf(conversation)
          for (const item of payload.items) {
            if (item.type === 'text') await client.sendText(number, markdownToWhatsApp(item.payload.text), delayFor(ctx.configuration, item.payload.text))
            else if (item.type === 'image') await client.sendMedia(number, { mediatype: 'image', url: item.payload.imageUrl })
            else if (item.type === 'audio') await client.sendAudio(number, item.payload.audioUrl)
            else if (item.type === 'video') await client.sendMedia(number, { mediatype: 'video', url: item.payload.videoUrl })
            else if (item.type === 'file') await client.sendMedia(number, { mediatype: 'document', url: item.payload.fileUrl, fileName: item.payload.title })
            else if (item.type === 'location') await client.sendLocation(number, { latitude: item.payload.latitude, longitude: item.payload.longitude, name: item.payload.title, address: item.payload.address })
          }
          await ack({ tags: {} })
        },
      },
    },
  },

  handler: async ({ req, client, ctx, logger }) => {
    const query = new URLSearchParams(req.query)
    if (query.get('token') !== webhookToken(ctx.configuration)) {
      logger.forBot().warn('Webhook recebido com token inválido: ignorado')
      return { status: 401 }
    }

    const body = JSON.parse(req.body ?? '{}')
    if (body.event !== 'messages.upsert') return

    const data = body.data ?? {}
    const key = data.key ?? {}
    let remoteJid: string = key.remoteJid ?? ''

    // Ignora mensagens enviadas pelo próprio número, grupos e status
    if (key.fromMe || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return

    // Contas com "LID" (identificador anônimo): usa o número real quando a Evolution informar
    if (remoteJid.endsWith('@lid')) {
      remoteJid = key.remoteJidAlt ?? key.senderPn ?? remoteJid
    }

    const message = data.message ?? {}
    let text: string | undefined =
      message.conversation ??
      message.extendedTextMessage?.text ??
      message.buttonsResponseMessage?.selectedDisplayText ??
      message.listResponseMessage?.title

    if (!text && message.audioMessage) {
      logger.forBot().info(`Áudio recebido. Campos: data=[${Object.keys(data).join(',')}] message=[${Object.keys(message).join(',')}]`)
      let transcript: string | null = null
      if (ctx.configuration.elevenLabsApiKey) {
        try {
          // O áudio pode vir no webhook (base64) ou ser baixado da Evolution pelo ID da mensagem
          const base64: string | undefined =
            message.base64 ?? data.base64 ?? (await evolution(ctx.configuration).getMediaBase64(data)).base64
          if (base64) {
            transcript = await transcribeAudio(ctx.configuration.elevenLabsApiKey, base64, message.audioMessage.mimetype)
          } else {
            logger.forBot().warn('Mensagem de voz recebida sem conteúdo de áudio')
          }
        } catch (err) {
          logger.forBot().error(`Falha ao transcrever áudio: ${String(err)}`)
        }
      } else {
        logger.forBot().warn('Mensagem de voz recebida, mas a chave ElevenLabs não está configurada')
      }
      text = transcript
        ? `🎤 [Mensagem de voz do cliente, transcrita]: ${transcript}`
        : '[O cliente enviou uma mensagem de voz que não pôde ser transcrita. Peça com carinho para ele escrever.]'
    }

    if (!text && (message.imageMessage || message.videoMessage || message.documentMessage || message.stickerMessage)) {
      const caption = message.imageMessage?.caption ?? message.videoMessage?.caption ?? message.documentMessage?.caption
      text = `[O cliente enviou uma ${message.imageMessage ? 'imagem' : message.videoMessage ? 'vídeo' : message.stickerMessage ? 'figurinha' : 'documento'}]${caption ? `: ${caption}` : ''}`
    }

    if (!text) {
      logger.forBot().debug(`Tipo de mensagem não suportado: ${data.messageType}`)
      return
    }

    const phone = remoteJid.split('@')[0] ?? remoteJid
    const { conversation } = await client.getOrCreateConversation({
      channel: 'channel',
      tags: { remoteJid },
      discriminateByTags: ['remoteJid'],
    })
    const { user } = await client.getOrCreateUser({
      tags: { remoteJid, phone },
      name: data.pushName,
      discriminateByTags: ['remoteJid'],
    })

    await client.getOrCreateMessage({
      type: 'text',
      payload: { text },
      conversationId: conversation.id,
      userId: user.id,
      tags: { id: key.id },
      discriminateByTags: ['id'], // a Evolution pode reenviar o mesmo evento
    })
  },
})
