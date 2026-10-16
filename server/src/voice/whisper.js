// Groq Whisper speech-to-text: the last fallback for patient voice questions,
// after Sarvam and the browser's own speech recognition. Uses GROQ_API_KEYS.

import { extensionFor } from './sarvam.js'

const TIMEOUT_MS = Number(process.env.GROQ_STT_TIMEOUT_MS) || 20_000

const keys = () =>
  (process.env.GROQ_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

export const isConfigured = () => keys().length > 0

/**
 * Tries each Groq key in turn.
 * @param {{ audio: Buffer, mimeType: string, lang: 'ml-IN'|'en-IN' }} req
 * @returns {Promise<{ text: string, lang: string }>}
 */
export async function transcribe({ audio, mimeType, lang }) {
  const all = keys()
  if (!all.length) {
    const err = new Error('GROQ_API_KEYS is not set')
    err.status = 503
    throw err
  }
  let lastError
  for (const key of all) {
    const form = new FormData()
    form.append('file', new Blob([audio], { type: mimeType }), `question.${extensionFor(mimeType)}`)
    form.append('model', process.env.GROQ_STT_MODEL?.trim() || 'whisper-large-v3')
    form.append('language', lang.slice(0, 2)) // ISO-639-1: ml / en
    form.append('response_format', 'json')
    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        lastError = new Error(`Groq Whisper HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
        lastError.status = res.status
        continue
      }
      const data = await res.json()
      return { text: (data.text ?? '').trim(), lang }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}
