// Teste rápido da voz da ElevenLabs. Uso: node test-elevenlabs.mjs
// Lê ELEVENLABS_API_KEY do arquivo .env e salva o resultado em teste-voz.mp3 para ouvir.
import axios from 'axios';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
);

async function test() {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY não encontrada no arquivo .env');
    return;
  }
  const voiceId = 'x8FWrDHAK5xiFTJLpnHq'; // Voz atual da Bila

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        text: "Oi, minha querida! Que bom ver você por aqui .. Teste de áudio de validação.",
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );
    fs.writeFileSync(new URL('teste-voz.mp3', import.meta.url), Buffer.from(response.data));
    console.log('Success! Byte length:', response.data.byteLength, '→ salvo em teste-voz.mp3');
  } catch (error) {
    if (error.response) {
      console.error('Error Status:', error.response.status);
      const errorText = Buffer.from(error.response.data).toString('utf-8');
      console.error('Error Body:', errorText);
    } else {
      console.error('Network/Other Error:', error.message);
    }
  }
}

test();
