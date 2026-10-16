// Push-to-talk recording: MediaRecorder for the server's speech-to-text, plus the
// browser's own Web Speech recognition running alongside, so its transcript is
// ready as the fallback if Sarvam fails (see voiceService.questionText).

import { SPEECH_LANG, VoiceError } from '../services/voiceService.js'

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
const RECOGNITION_END_WAIT_MS = 1500

function startBrowserRecognition(lang) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) return null
  const parts = []
  let ended = false
  let onEnd = () => {}
  const rec = new Recognition()
  rec.lang = SPEECH_LANG[lang] ?? 'ml-IN'
  rec.continuous = true
  rec.interimResults = false
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) parts.push(e.results[i][0].transcript)
    }
  }
  rec.onerror = () => {} // e.g. 'network' / 'not-allowed': the server engines still run
  rec.onend = () => {
    ended = true
    onEnd()
  }
  try {
    rec.start()
  } catch {
    return null
  }
  return {
    /** @returns {Promise<string>} */
    stop: () =>
      new Promise((resolve) => {
        const done = () => resolve(parts.join(' ').trim())
        if (ended) return done()
        onEnd = done
        setTimeout(done, RECOGNITION_END_WAIT_MS)
        try {
          rec.stop()
        } catch {
          done()
        }
      }),
    abort: () => {
      try {
        rec.abort()
      } catch {
        // already stopped
      }
    },
  }
}

/**
 * Starts recording. Throws VoiceError('micDenied' | 'noMic').
 * @returns {Promise<{ stop(): Promise<{ blob: Blob, browserText: string }>, cancel(): void }>}
 */
export async function startRecording(lang) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new VoiceError('noMic')
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    throw new VoiceError(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'micDenied' : 'noMic')
  }
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise((resolve) => (recorder.onstop = resolve))
  recorder.start()
  const recognition = startBrowserRecognition(lang)
  const release = () => stream.getTracks().forEach((t) => t.stop())

  return {
    async stop() {
      if (recorder.state !== 'inactive') recorder.stop()
      const [browserText] = await Promise.all([recognition?.stop() ?? '', stopped])
      release()
      return { blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }), browserText }
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop()
      recognition?.abort()
      release()
    },
  }
}
