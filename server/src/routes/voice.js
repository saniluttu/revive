import express, { Router } from 'express'
import * as sarvam from '../voice/sarvam.js'
import * as whisper from '../voice/whisper.js'

const router = Router()

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const toLang = (lang) => (sarvam.LANGS.includes(lang) ? lang : String(lang).startsWith('ml') ? 'ml-IN' : 'en-IN')

// POST /api/tts  { text, lang: 'ml-IN'|'en-IN' }  → audio/mpeg
// 503 { error: 'tts_unavailable' } when Sarvam is down or not configured — the
// client then speaks with the browser's speechSynthesis.
router.post('/tts', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(400).json({ error: 'empty_text' })
  if (text.length > sarvam.MAX_TTS_CHARS) return res.status(400).json({ error: 'text_too_long' })
  try {
    const { audio, mimeType } = await sarvam.textToSpeech({ text, lang: toLang(req.body.lang) })
    res.type(mimeType).send(audio)
  } catch (err) {
    console.warn(`[tts] Sarvam failed: ${err.message}`)
    res.status(503).json({ error: 'tts_unavailable' })
  }
})

// Speech-to-text engines in order. The browser's Web Speech API sits between
// them on the client: it asks for `sarvam` first, uses its own transcript if
// Sarvam fails, then asks for `groq`.
const STT = {
  sarvam: (req) => sarvam.speechToText(req),
  groq: (req) => whisper.transcribe(req),
}

// POST /api/stt?lang=ml-IN&provider=sarvam|groq   body: the recording (audio/webm, audio/ogg, audio/mp4…)
// → { text, lang, provider }   or 503 { error: 'stt_unavailable' }
// Without `provider`, tries Sarvam then Groq Whisper.
router.post('/stt', express.raw({ type: 'audio/*', limit: MAX_AUDIO_BYTES }), async (req, res) => {
  const audio = req.body
  if (!Buffer.isBuffer(audio) || !audio.length) return res.status(400).json({ error: 'empty_audio' })
  const lang = toLang(req.query.lang ?? 'ml-IN')
  const mimeType = req.get('content-type')
  const requested = req.query.provider
  if (requested && !STT[requested]) return res.status(400).json({ error: 'unknown_provider' })

  for (const provider of requested ? [requested] : Object.keys(STT)) {
    try {
      const { text } = await STT[provider]({ audio, mimeType, lang })
      console.log(`[stt] ${provider} transcribed ${audio.length} bytes (${lang})`)
      return res.json({ text, lang, provider })
    } catch (err) {
      console.warn(`[stt] ${provider} failed: ${err.message}`)
    }
  }
  res.status(503).json({ error: 'stt_unavailable' })
})

export default router
