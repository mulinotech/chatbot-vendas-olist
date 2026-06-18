import axios from 'axios';

async function test() {
  const apiKey = 'sk_cc20253d81176de4ab8d074036b3386019ba6929be38e02c';
  const voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - Voz pré-fabricada padrão e ativa
  
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=opus_48000_32`,
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
    console.log('Success! Byte length:', response.data.byteLength);
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
