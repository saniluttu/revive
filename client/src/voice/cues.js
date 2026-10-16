// Spoken cues for the Live Session (F7). Pure JS: also imported by
// server/scripts/generate-voice-cues.js, which pre-generates one audio file per
// cue and language from the same text, so the session never calls an API.
//
// Cue ids: rep-1 … rep-20, wellDone, rest, setComplete, notCounted, higher,
// fix-<rule id> (the correction for each form rule, text from `rules.<id>`),
// and per exercise: ex-<id>-intro (name + setup), ex-<id>-step-<n> (its steps,
// read aloud one by one) and ex-<id>-tip (repeated between sets).

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
  for (const [id, ex] of Object.entries(dict.exercises)) {
    out[`ex-${id}-intro`] = dict.voice.instructions.intro.replace('{{name}}', ex.name).replace('{{setup}}', ex.setup)
    ex.steps.forEach((text, i) => (out[`ex-${id}-step-${i + 1}`] = text))
    out[`ex-${id}-tip`] = ex.tip
  }
  return out
}

/**
 * An exercise's instructions in reading order.
 * @returns {{ id: string, step: number }[]} step -1 = the intro, 0… = index into `steps`
 */
export function instructionCues(dict, exerciseId) {
  const steps = dict.exercises[exerciseId]?.steps ?? []
  return [{ id: `ex-${exerciseId}-intro`, step: -1 }, ...steps.map((_, i) => ({ id: `ex-${exerciseId}-step-${i + 1}`, step: i }))]
}

const isPartial = (snap) => /\.cues\.partial$/.test(snap?.correction?.key ?? '')

/**
 * What to say when the rep counter moves from `prev` to `next` (snapshots from repCounter.js).
 * Between sets the exercise's key tip is repeated.
 * A rep that is rejected while still in progress is announced straight away.
 * `high` cues (rep finished, rejected, set/exercise done) interrupt whatever is playing;
 * `low` ones (form corrections) are dropped if something is already playing.
 * @returns {{ ids: string[], priority: 'high'|'low' } | null}
 */
export function cuesForUpdate(prev, next, exerciseId) {
  if (!prev || !next) return null

  if (next.attempts > prev.attempts) {
    const attempt = next.lastAttempt
    if (!attempt.counted) {
      if (prev.rejected === attempt.reason) return null // already said when it happened
      return { ids: ['notCounted', `fix-${attempt.reason}`], priority: 'high' }
    }
    const ids = attempt.rep >= 1 && attempt.rep <= 20 ? [`rep-${attempt.rep}`] : []
    if (next.status === 'rest' && prev.status !== 'rest') {
      ids.push('setComplete', 'rest')
      if (exerciseId) ids.push(`ex-${exerciseId}-tip`)
    }
    if (next.status === 'done' && prev.status !== 'done') ids.push('wellDone')
    return ids.length ? { ids, priority: 'high' } : null
  }

  // Said as soon as a rep in progress is rejected (too fast, too high, waving…)
  if (next.rejected && next.rejected !== prev.rejected) return { ids: ['notCounted', `fix-${next.rejected}`], priority: 'high' }

  const fault = next.activeFaults?.[0]
  if (fault && fault !== prev.activeFaults?.[0]) return { ids: [`fix-${fault}`], priority: 'low' }

  if (isPartial(next) && !isPartial(prev)) return { ids: ['higher'], priority: 'low' }
  return null
}
