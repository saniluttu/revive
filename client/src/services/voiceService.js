// Patient voice questions (F10): speech-to-text, the physio assistant and
// text-to-speech, through the Express server (server/src/routes/voice.js, chat.js).
//
// Speech-to-text order: Sarvam (server) → the browser's Web Speech transcript
// (recorded at the same time, see useVoiceQuestion) → Groq Whisper (server).
// Text-to-speech: Sarvam (server) → the browser's speechSynthesis.

const API_BASE = import.meta.env.VITE_API_URL ?? ''
export const SPEECH_LANG = { en: 'en-IN', ml: 'ml-IN' }

/** Error with a `code` the UI maps to `voice.errors.<code>`. */
export class VoiceError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

async function post(path, init) {
  try {
    return await fetch(`${API_BASE}${path}`, { method: 'POST', ...init })
  } catch {
    throw new VoiceError('network')
  }
}

/**
 * One speech-to-text engine on the server.
 * @returns {Promise<string>} transcript ('' if nothing was heard)
 */
export async function transcribe(blob, lang, provider) {
  const params = new URLSearchParams({ lang: SPEECH_LANG[lang] ?? 'ml-IN', provider })
  const res = await post(`/api/stt?${params}`, { headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob })
  if (!res.ok) throw new VoiceError('sttUnavailable')
  const { text } = await res.json()
  return (text ?? '').trim()
}

/**
 * The full speech-to-text chain.
 * @param blob       the recording
 * @param browserText what the browser's own recognition heard meanwhile ('' if unsupported)
 * @param transcribeFn injectable for tests
 */
export async function questionText(blob, browserText, lang, transcribeFn = transcribe) {
  let networkDown = false
  const tryServer = async (provider) => {
    if (!blob?.size) return ''
    try {
      return await transcribeFn(blob, lang, provider)
    } catch (err) {
      if (err.code === 'network') networkDown = true
      return ''
    }
  }
  const text = (await tryServer('sarvam')) || browserText?.trim() || (networkDown ? '' : await tryServer('groq'))
  if (text) return text
  if (networkDown) throw new VoiceError('network')
  throw new VoiceError(blob?.size ? 'notHeard' : 'sttUnavailable')
}

/**
 * @param ctx { lang, exerciseId?, plan?: [{ exerciseId, reps, sets }], history?: [{ role, content }] }
 * @returns {Promise<{ reply: string | null, redFlag: boolean }>}
 */
export async function askAssistant(question, ctx) {
  const res = await post('/api/chat', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...ctx }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new VoiceError(res.status === 503 ? 'aiUnavailable' : 'network')
  return { reply: body.reply ?? null, redFlag: Boolean(body.redFlag) }
}

// ---------- speaking ----------

let current = null // { stop() }
let speakRun = 0 // bumped by stopSpeaking, so a reply still loading isn't played after Stop

function speakWithBrowser(text, lang) {
  const synth = window.speechSynthesis
  if (!synth) return Promise.resolve()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = SPEECH_LANG[lang] ?? 'en-IN'
    utterance.onend = resolve
    utterance.onerror = resolve
    current = {
      stop: () => {
        synth.cancel()
        resolve()
      },
    }
    synth.speak(utterance)
  })
}

async function playBlob(blob) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  try {
    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = () => reject(new Error('playback failed'))
      current = {
        stop: () => {
          audio.pause()
          resolve()
        },
      }
      audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Speaks `text` with Sarvam, or the browser's voice if that fails. Resolves when done or stopped. */
export async function speak(text, lang) {
  stopSpeaking()
  const myRun = speakRun
  let blob = null
  try {
    const res = await post('/api/tts', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: SPEECH_LANG[lang] ?? 'en-IN' }),
    })
    if (res.ok) blob = await res.blob()
  } catch {
    // fall through to the browser's voice
  }
  if (myRun !== speakRun) return
  if (blob) {
    try {
      return await playBlob(blob)
    } catch {
      // e.g. autoplay blocked — try the browser's voice
    }
  }
  return speakWithBrowser(text, lang)
}

export function stopSpeaking() {
  speakRun++
  current?.stop()
  current = null
}
