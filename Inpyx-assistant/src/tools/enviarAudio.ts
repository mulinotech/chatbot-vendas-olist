import { Autonomous, z, context, user } from '@botpress/runtime'

/**
 * Tool: enviarAudio
 *
 * Gera áudio via ElevenLabs e armazena a URL no user.state.pendingAudioUrl
 * para que o handler da conversa envie via conversation.send().
 *
 * Formatos por canal:
 *   - webchat / outros : MP3 128kbps  → audio/mpeg  (compatibilidade universal com browsers)
 *   - whatsapp         : OGG Opus     → audio/ogg   (exigência da API do WhatsApp)
 *
 * Cota ElevenLabs: 1 crédito = 1 caractere. O texto de áudio é truncado em
 * MAX_AUDIO_CHARS para evitar erros de quota_exceeded.
 */

const ELEVENLABS_API_KEY = 'sk_cc20253d81176de4ab8d074036b3386019ba6929be38e02c'

// Vozes disponíveis (pré-fabricadas, acessíveis via API em qualquer plano):
// Para usar a voz "Raquel" da Biblioteca da ElevenLabs, o plano Creator ou superior é necessário.
// Enquanto isso, usamos Sarah (pt-BR compatível) ou substitua pelo ID da Raquel quando disponível.
const VOICE_ID_PADRAO = 'EXAVITQu4vr4xnSDxMaL' // Sarah — voz pré-fabricada (gratuita via API)
// const VOICE_ID_RAQUEL = 'SEU_VOICE_ID_RAQUEL'  // Adicione aqui quando tiver o ID da Raquel

/**
 * Número máximo de caracteres enviados ao ElevenLabs por chamada.
 * Cada caractere = 1 crédito. Ajuste conforme sua cota mensal disponível.
 * - Plano Free:    10.000 créditos/mês  → ~66 mensagens de áudio
 * - Plano Starter: 30.000 créditos/mês  → ~200 mensagens de áudio
 * ⚠️ Com apenas 175 créditos restantes, mantemos em 150 para caber na cota atual.
 *    Após renovação mensal, pode aumentar para 250.
 */
const MAX_AUDIO_CHARS = 150

export const enviarAudio = new Autonomous.Tool({
  name: 'enviarAudio',
  description:
    'Converte um texto em mensagem de voz usando a API da ElevenLabs e prepara para envio na conversa. ' +
    'Use sempre que precisar enviar uma resposta acolhedora em áudio. ' +
    'Se a geração falhar, o sistema automaticamente enviará o texto normalmente.',

  input: z.object({
    text: z
      .string()
      .describe(
        'O texto exato que a Bila deve falar em áudio. ' +
          'Seja concisa e acolhedora — máximo 200 caracteres para garantir geração bem-sucedida.'
      ),
  }),

  output: z.string(),

  handler: async ({ text }) => {
    try {
      // ── 1. Detectar o canal para escolher o formato adequado ─────────────────
      const conversationCtx = context.get('conversation', { optional: true })
      const channel = (conversationCtx as any)?.channel ?? 'webchat'
      const isWhatsApp = channel === 'whatsapp'

      // Webchat/outros → MP3 (compatível com todos os browsers)
      // WhatsApp       → OGG Opus (exigido pela API da Meta)
      const outputFormat = isWhatsApp ? 'opus_48000_64' : 'mp3_44100_128'
      const contentType  = isWhatsApp ? 'audio/ogg'    : 'audio/mpeg'
      const fileExt      = isWhatsApp ? 'ogg'          : 'mp3'

      console.log(`[enviarAudio] Canal: ${channel} | Formato: ${outputFormat}`)

      // ── 2. Truncar texto para não exceder a cota do ElevenLabs ───────────────
      const audioText =
        text.length > MAX_AUDIO_CHARS
          ? text.substring(0, MAX_AUDIO_CHARS).replace(/\s+\S*$/, '') + '…'
          : text

      if (text.length > MAX_AUDIO_CHARS) {
        console.warn(
          `[enviarAudio] Texto truncado de ${text.length} para ${audioText.length} chars (limite: ${MAX_AUDIO_CHARS})`
        )
      }

      // ── 3. Chamar API do ElevenLabs ─────────────────────────────────────────
      const voiceId = VOICE_ID_PADRAO
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`

      const response = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: audioText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.55,
            similarity_boost: 0.80,
            style: 0.10,
            use_speaker_boost: true,
          },
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error(`[enviarAudio] ElevenLabs error ${response.status}:`, errBody)

        // Mensagem amigável para quota_exceeded
        if (errBody.includes('quota_exceeded')) {
          return (
            'Cota de áudio temporariamente esgotada. ' +
            'Responderei por texto agora — o áudio voltará quando a cota for renovada.'
          )
        }

        return `Não foi possível gerar o áudio (status ${response.status}). Responderei por texto.`
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioData = Buffer.from(arrayBuffer)

      console.log(`[enviarAudio] Áudio recebido: ${audioData.byteLength} bytes`)

      if (!audioData || audioData.byteLength === 0) {
        return 'ElevenLabs retornou arquivo vazio. Responderei por texto.'
      }

      // ── 4. Fazer upload para a CDN do Botpress ──────────────────────────────
      const client = context.get('client')
      const fileKey = `audios/bila-voice-${Date.now()}.${fileExt}`

      const { file } = await client.uploadFile({
        key: fileKey,
        content: audioData,
        contentType,
        accessPolicies: ['public_content'],
        publicContentImmediatelyAccessible: true,
      })

      if (!file?.url) {
        return 'Erro ao fazer upload do áudio para o servidor. Responderei por texto.'
      }

      console.log(`[enviarAudio] CDN URL: ${file.url}`)

      // ── 5. Salvar URL no estado do usuário para envio pelo handler ───────────
      // O handler da conversa usa conversation.send() — a API correta para envio
      user.state.pendingAudioUrl = file.url

      return 'Áudio gerado com sucesso e pronto para envio!'
    } catch (error: any) {
      console.error('[enviarAudio] Erro inesperado:', error)
      return 'Não consegui gerar o áudio desta vez. Responderei normalmente por texto.'
    }
  },
})
