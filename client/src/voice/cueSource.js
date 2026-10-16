// Where a cue's audio comes from, in order:
//   1. the pre-generated pack (public/audio, see server/scripts/generate-voice-cues.js)
//   2. this browser's IndexedDB cache of earlier Sarvam replies
//   3. Sarvam via POST /api/tts — then cached
//   4. English only: the browser's speechSynthesis. Never for Malayalam: most
//      systems (e.g. Windows) have no Malayalam voice and it plays silence.

/**
 * @param cue  { id, lang: 'en'|'ml', text }
 * @param deps { packFile(id, lang) → Promise<ArrayBuffer|null> (with .path), cacheGet(key), cachePut(key, value),
 *               tts(text, lang) → Promise<{ bytes: ArrayBuffer, type: string }> }
 * @returns {Promise<{ bytes: ArrayBuffer, source: string } | { speak: true, source: string } | { source: null, error: string }>}
 */
export async function resolveCueAudio({ id, lang, text }, deps) {
  const pack = await deps.packFile(id, lang).catch(() => null)
  if (pack) return { bytes: pack.bytes, source: `pack file ${pack.path}` }

  const key = cacheKey(lang, text)
  const cached = await deps.cacheGet(key).catch(() => null)
  if (cached?.bytes) return { bytes: cached.bytes, source: 'IndexedDB cache (from Sarvam)' }

  let ttsError
  try {
    const audio = await deps.tts(text, lang)
    // decodeAudioData detaches the buffer it is given, so cache a copy
    await deps.cachePut(key, { bytes: audio.bytes.slice(0), type: audio.type }).catch(() => {})
    return { bytes: audio.bytes, source: 'Sarvam /api/tts (now cached)' }
  } catch (err) {
    ttsError = err?.message ?? String(err)
  }

  if (lang === 'en') return { speak: true, source: `browser speechSynthesis (Sarvam failed: ${ttsError})` }
  return { source: null, error: `no audio: not in the pack, not cached, Sarvam failed (${ttsError})` }
}

export const cacheKey = (lang, text) => `${lang}|${text}`

/** Runs at most `limit` calls of `fn` at a time (so preloading doesn't flood Sarvam). */
export function limitConcurrency(fn, limit = 2) {
  let active = 0
  const waiting = []
  const next = () => {
    if (active >= limit || !waiting.length) return
    active++
    const { args, resolve, reject } = waiting.shift()
    fn(...args)
      .then(resolve, reject)
      .finally(() => {
        active--
        next()
      })
  }
  return (...args) =>
    new Promise((resolve, reject) => {
      waiting.push({ args, resolve, reject })
      next()
    })
}
