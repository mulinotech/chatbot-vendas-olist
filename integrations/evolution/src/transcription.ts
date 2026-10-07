// Transcrição das mensagens de voz recebidas usando o Speech-to-Text da ElevenLabs (modelo Scribe).

export async function transcribeAudio(apiKey: string, base64Audio: string, mimetype = 'audio/ogg'): Promise<string | null> {
  const audio = Buffer.from(base64Audio, 'base64')
  const form = new FormData()
  form.append('model_id', 'scribe_v1')
  form.append('language_code', 'por')
  form.append('file', new Blob([audio], { type: mimetype.split(';')[0] }), 'audio.ogg')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  })
  if (!res.ok) {
    throw new Error(`ElevenLabs STT retornou ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as { text?: string }
  return data.text?.trim() || null
}
