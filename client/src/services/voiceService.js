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

/**
 * Sarvam text-to-speech through the server.
 * @returns {Promise<{ bytes: ArrayBuffer, type: string }>} throws if the server or Sarvam fails
 */
export async function fetchTts(text, lang) {
  const res = await post('/api/tts', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang: SPEECH_LANG[lang] ?? 'en-IN' }),
  })
  if (!res.ok) throw new Error(`/api/tts HTTP ${res.status}${res.status === 503 ? ' (is SARVAM_API_KEY set in server/.env?)' : ''}`)
  return { bytes: await res.arrayBuffer(), type: res.headers.get('content-type') || 'audio/mpeg' }
}

/**
 * Speaks `text` with Sarvam. If that fails, English falls back to the browser's
 * voice; Malayalam does not (most systems have no Malayalam voice and would play
 * silence) — the reply stays on screen. Resolves when done or stopped.
 */
export async function speak(text, lang) {
  stopSpeaking()
  const myRun = speakRun
  let audio = null
  let failure = null
  try {
    audio = await fetchTts(text, lang)
  } catch (err) {
    failure = err.message
  }
  if (myRun !== speakRun) return
  if (audio) {
    try {
      console.info(`[voice] reply (${lang}) ← Sarvam /api/tts`)
      return await playBlob(new Blob([audio.bytes], { type: audio.type }))
    } catch (err) {
      failure = `playback failed: ${err.message}`
    }
  }
  if (lang === 'ml') {
    console.warn(`[voice] reply (ml) not spoken — ${failure}. No browser fallback for Malayalam.`)
    return
  }
  console.info(`[voice] reply (en) ← browser speechSynthesis (${failure})`)
  return speakWithBrowser(text, lang)
}

export function stopSpeaking() {
  speakRun++
  current?.stop()
  current = null
}
