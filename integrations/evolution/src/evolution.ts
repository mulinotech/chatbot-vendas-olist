// Cliente mínimo da Evolution API v2 (https://doc.evolution-api.com)

export type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instance: string
}

export class EvolutionClient {
  private readonly baseUrl: string

  constructor(private readonly config: EvolutionConfig) {
    // Aceita tanto https://servidor quanto https://servidor/manager
    this.baseUrl = new URL(config.baseUrl).origin
  }

  private async request<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Evolution API ${method} ${path} retornou ${res.status}: ${text.slice(0, 300)}`)
    }
    return (text ? JSON.parse(text) : null) as T
  }

  private get instancePath() {
    return encodeURIComponent(this.config.instance)
  }

  setWebhook(url: string, enabled: boolean) {
    return this.request('POST', `/webhook/set/${this.instancePath}`, {
      webhook: {
        enabled,
        url,
        byEvents: false,
        base64: true, // áudios chegam já em base64, prontos para transcrever
        events: ['MESSAGES_UPSERT'],
      },
    })
  }

  /** Baixa a mídia de uma mensagem recebida (usado quando o webhook não trouxe o base64). */
  getMediaBase64(webhookMessage: { key: unknown; message: unknown }) {
    // A Evolution precisa da mensagem completa (key + message), como veio no webhook
    return this.request<{ base64?: string; mimetype?: string }>(
      'POST',
      `/chat/getBase64FromMediaMessage/${this.instancePath}`,
      { message: { key: webhookMessage.key, message: webhookMessage.message }, convertToMp4: false }
    )
  }

  sendText(number: string, text: string, delay?: number) {
    return this.request('POST', `/message/sendText/${this.instancePath}`, { number, text, delay })
  }

  sendAudio(number: string, audioUrl: string, delay?: number) {
    // A Evolution baixa o arquivo e converte para mensagem de voz (PTT) do WhatsApp
    return this.request('POST', `/message/sendWhatsAppAudio/${this.instancePath}`, { number, audio: audioUrl, delay })
  }

  sendMedia(
    number: string,
    media: { mediatype: 'image' | 'video' | 'document'; url: string; caption?: string; fileName?: string; mimetype?: string },
    delay?: number
  ) {
    return this.request('POST', `/message/sendMedia/${this.instancePath}`, {
      number,
      mediatype: media.mediatype,
      media: media.url,
      caption: media.caption,
      fileName: media.fileName,
      mimetype: media.mimetype,
      delay,
    })
  }

  sendLocation(number: string, location: { latitude: number; longitude: number; name?: string; address?: string }) {
    return this.request('POST', `/message/sendLocation/${this.instancePath}`, { number, ...location })
  }
}

/** Converte o Markdown que o LLM escreve para a formatação do WhatsApp. */
export function markdownToWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*') // títulos viram negrito
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // **negrito** → *negrito*
    .replace(/__(.+?)__/g, '_$1_') // __itálico__ → _itálico_
    .replace(/~~(.+?)~~/g, '~$1~') // ~~riscado~~ → ~riscado~
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '$1') // imagens markdown → só a URL
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => (label === url ? url : `${label}: ${url}`))
    .replace(/^\s*[-*]\s+/gm, '• ') // listas
}

/** Tempo de "digitando..." proporcional ao tamanho da mensagem (entre 0,8 e 2 segundos). */
export function typingDelayFor(text: string): number {
  return Math.min(2000, Math.max(800, text.length * 10))
}
