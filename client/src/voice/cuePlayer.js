// Plays the Live Session's spoken cues (F7) from the pre-generated cue pack in
// public/audio (see server/scripts/generate-voice-cues.js). No API calls: files
// are fetched and decoded when the session page opens, then played instantly
// with Web Audio. A cue missing from the pack — or whose text has changed since
// it was generated — is spoken by the browser's speechSynthesis instead.

import i18n from '../i18n/index.js'
import { COOLDOWN_MS, cueTexts } from './cues.js'

const SPEECH_LANG = { en: 'en-IN', ml: 'ml-IN' }

/**
 * Cooldown + priority queue, independent of how audio is played (unit-tested).
 * @param output { play(id, lang): Promise<void> (resolves when done or stopped), stop(): void }
 */
export function createCueQueue({ output, now = () => performance.now(), cooldownMs = COOLDOWN_MS }) {
  const lastPlayed = new Map() // `${lang}:${id}` → time
  let queue = []
  let playing = false
  let run = 0 // bumped on interrupt so the old loop stops

  async function drain(myRun) {
    playing = true
    while (queue.length && myRun === run) {
      const { id, lang } = queue.shift()
      try {
        await output.play(id, lang)
      } catch {
        // a cue that can't play is skipped
      }
    }
    if (myRun === run) playing = false
  }

  /** @param update { ids, priority } from cuesForUpdate */
  function say(update, lang) {
    if (!update) return
    const t = now()
    const fresh = update.ids.filter((id) => !(t - (lastPlayed.get(`${lang}:${id}`) ?? -Infinity) < cooldownMs))
    if (!fresh.length) return
    if (playing && update.priority !== 'high') return
    for (const id of fresh) lastPlayed.set(`${lang}:${id}`, t)
    if (playing) stop()
    queue.push(...fresh.map((id) => ({ id, lang })))
    drain(run)
  }

  function stop() {
    run++
    queue = []
    playing = false
    output.stop()
  }

  return { say, stop, isPlaying: () => playing }
}

// ---------- browser output: Web Audio for the pack, speechSynthesis as fallback ----------

const AUDIO_BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/`

let context = null
let manifestPromise = null
const buffers = new Map() // `${lang}:${id}` → Promise<AudioBuffer | null>
const textCache = new Map() // lang → { id: text }
let current = null // { stop() }

function audioContext() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!Ctx) return null
  context ??= new Ctx()
  return context
}

function textsFor(lang) {
  if (!textCache.has(lang)) textCache.set(lang, cueTexts(i18n.getResourceBundle(lang, 'translation')))
  return textCache.get(lang)
}

function loadManifest() {
  manifestPromise ??= fetch(`${AUDIO_BASE}manifest.json`)
    .then((res) => (res.ok ? res.json() : { cues: {} }))
    .catch(() => ({ cues: {} }))
  return manifestPromise
}

// The pack's entry for a cue, only if it was generated from the current text
async function packEntry(id, lang) {
  const entry = (await loadManifest()).cues?.[lang]?.[id]
  return entry && entry.text === textsFor(lang)[id] ? entry : null
}

function loadBuffer(id, lang) {
  const key = `${lang}:${id}`
  if (!buffers.has(key)) {
    buffers.set(
      key,
      (async () => {
        const entry = await packEntry(id, lang)
        const ctx = audioContext()
        if (!entry || !ctx) return null
        const res = await fetch(`${AUDIO_BASE}${entry.file}`)
        if (!res.ok) return null
        return ctx.decodeAudioData(await res.arrayBuffer())
      })().catch(() => null),
    )
  }
  return buffers.get(key)
}

function playBuffer(buffer) {
  const ctx = audioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return new Promise((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = resolve
    current = {
      stop: () => {
        try {
          source.stop()
        } catch {
          // already stopped
        }
        resolve()
      },
    }
    source.start()
  })
}

function speakText(text, lang) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || !text) return Promise.resolve()
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

const browserOutput = {
  async play(id, lang) {
    const buffer = await loadBuffer(id, lang)
    return buffer ? playBuffer(buffer) : speakText(textsFor(lang)[id], lang)
  },
  stop() {
    current?.stop()
    current = null
  },
}

const queue = createCueQueue({ output: browserOutput })

/** Fetch and decode every cue for a language so playback is instant. */
export async function preloadCues(lang) {
  const ids = Object.keys(textsFor(lang))
  await Promise.all(ids.map((id) => loadBuffer(id, lang)))
}

/** Call from a click (e.g. Start camera) so the browser lets audio play. */
export function unlockAudio() {
  audioContext()
    ?.resume()
    .catch(() => {})
}

export const sayCues = (update, lang) => queue.say(update, lang)
export const stopCues = () => queue.stop()
