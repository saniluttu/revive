// Spoken cues for the Live Session (F7). Pure JS: also imported by
// server/scripts/generate-voice-cues.js, which pre-generates one audio file per
// cue and language from the same text, so the session never calls an API.
//
// Cue ids: rep-1 … rep-20, wellDone, rest, setComplete, notCounted, higher,
// and fix-<rule id> (the correction for each form rule, text from `rules.<id>`).

export const CUE_LANGS = ['en', 'ml']
export const COOLDOWN_MS = 3000 // the same cue isn't repeated within this time

const EVENT_CUES = ['wellDone', 'rest', 'setComplete', 'notCounted', 'higher']

/**
 * Every cue's text for one language.
 * @param dict a translation file (en.json / ml.json)
 * @returns {Record<string, string>} cue id → text
 */
export function cueTexts(dict) {
  const v = dict.voice.cues
  const out = {}
  v.rep.forEach((text, i) => (out[`rep-${i + 1}`] = text))
  for (const id of EVENT_CUES) out[id] = v[id]
  for (const [rule, text] of Object.entries(dict.rules)) out[`fix-${rule}`] = text
  return out
}

const isPartial = (snap) => /\.cues\.partial$/.test(snap?.correction?.key ?? '')

/**
 * What to say when the rep counter moves from `prev` to `next` (snapshots from repCounter.js).
 * `high` cues (rep finished, set/exercise done) interrupt whatever is playing;
 * `low` ones (form corrections) are dropped if something is already playing.
 * @returns {{ ids: string[], priority: 'high'|'low' } | null}
 */
export function cuesForUpdate(prev, next) {
  if (!prev || !next) return null

  if (next.attempts > prev.attempts) {
    const attempt = next.lastAttempt
    if (!attempt.counted) return { ids: ['notCounted', `fix-${attempt.reason}`], priority: 'high' }
    const ids = attempt.rep >= 1 && attempt.rep <= 20 ? [`rep-${attempt.rep}`] : []
    if (next.status === 'rest' && prev.status !== 'rest') ids.push('setComplete', 'rest')
    if (next.status === 'done' && prev.status !== 'done') ids.push('wellDone')
    return ids.length ? { ids, priority: 'high' } : null
  }

  const fault = next.activeFaults?.[0]
  if (fault && fault !== prev.activeFaults?.[0]) return { ids: [`fix-${fault}`], priority: 'low' }

  if (isPartial(next) && !isPartial(prev)) return { ids: ['higher'], priority: 'low' }
  return null
}
