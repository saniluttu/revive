// Sarvam AI speech APIs (https://docs.sarvam.ai): Bulbul text-to-speech and
// Saaras speech-to-text, for Malayalam (ml-IN) and Indian English (en-IN).
// Errors carry `status` (HTTP code) when known, like the LLM providers.

const BASE_URL = 'https://api.sarvam.ai'
export const LANGS = ['ml-IN', 'en-IN']
export const MAX_TTS_CHARS = 2500 // bulbul:v3 limit per text

const TIMEOUT_MS = Number(process.env.SARVAM_TIMEOUT_MS) || 20_000

const env = (name) => process.env[name]?.trim() || null
export const isConfigured = () => Boolean(env('SARVAM_API_KEY'))

async function check(res) {
  if (res.ok) return res.json()
  const err = new Error(`Sarvam HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  err.status = res.status
  throw err
}

function requireKey() {
  const key = env('SARVAM_API_KEY')
  if (!key) {
    const err = new Error('SARVAM_API_KEY is not set')
    err.status = 503
    throw err
  }
  return key
}

/**
 * @param {{ text: string, lang: 'ml-IN'|'en-IN', codec?: 'mp3'|'wav' }} req
 * @returns {Promise<{ audio: Buffer, mimeType: string }>}
 */
export async function textToSpeech({ text, lang, codec = 'mp3' }) {
  const key = requireKey()
  const body = {
    text,
    language_code: lang,
    model: env('SARVAM_TTS_MODEL') ?? 'bulbul:v3',
    output_audio_codec: codec,
    pace: Number(env('SARVAM_TTS_PACE')) || 0.9, // a little slower for older patients
  }
  const speaker = env('SARVAM_TTS_SPEAKER')
  if (speaker) body.speaker = speaker
  const res = await fetch(`${BASE_URL}/text-to-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await check(res)
  const audio = data.audios?.[0]
  if (!audio) throw new Error('Sarvam returned no audio')
  return { audio: Buffer.from(audio, 'base64'), mimeType: codec === 'wav' ? 'audio/wav' : 'audio/mpeg' }
}

/**
 * @param {{ audio: Buffer, mimeType: string, lang: 'ml-IN'|'en-IN' }} req
 * @returns {Promise<{ text: string, lang: string | null }>}
 */
export async function speechToText({ audio, mimeType, lang }) {
  const key = requireKey()
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mimeType }), `question.${extensionFor(mimeType)}`)
  form.append('model', env('SARVAM_STT_MODEL') ?? 'saaras:v4')
  // Malayalam mode still transcribes English words a patient mixes in
  form.append('language_code', lang)
  const res = await fetch(`${BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': key },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await check(res)
  return { text: (data.transcript ?? '').trim(), lang: data.language_code ?? lang }
}

export function extensionFor(mimeType = '') {
  const type = mimeType.split(';')[0].trim()
  return (
    {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
    }[type] ?? 'webm'
  )
}
