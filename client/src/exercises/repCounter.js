// Rep counting state machine + form monitoring + per-rep quality (F6).
//
// Session status:  framing → calibrating → active ⇄ rest → done
// Rep phases:      START → UP → TOP → DOWN → START  = 1 rep, only if TOP (target ROM) was reached
// A rep that reached the target is still "not counted" when:
//   - a `blockAtTarget` fault (e.g. shrug) was active as the target was crossed, or
//   - the exercise's `mainFault` was held for most of the rep
//
// Pure JS (no React) so it can be unit-tested with synthetic poses.

import { extractFeatures, PART_LABELS } from './body.js'
import { RULES } from './rules.js'

export const CALIBRATION_MS = 1500 // hold still in the start position to capture a baseline
const FAULT_HOLD_MS = 250 // a wrong movement must last this long to count (ignores landmark jitter)
const MESSAGE_HOLD_MS = 1800 // how long a one-off message stays on screen
const MIN_REP_MS = 700 // faster than this is noise, not a rep
const FAST_REP_MS = 1500 // faster than this loses smoothness points
const DEFAULT_REST_MS = 30_000
const SMOOTHING = 0.5 // exponential moving average weight for the metric
const HYSTERESIS = 0.15 // fraction of (target − rest) used as a dead band between phases
const PATH_DEADBAND = 0.03 // fraction of (target − rest); smaller wiggles don't count as jerkiness
const MAIN_FAULT_SHARE = 0.5 // main compensation held longer than this share of the rep → not counted

const clamp01 = (x) => Math.min(1, Math.max(0, x))

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

function makeBaseline(samples) {
  return {
    earShoulder: {
      left: median(samples.map((f) => f.earShoulder.left)),
      right: median(samples.map((f) => f.earShoulder.right)),
    },
    trunkLean: median(samples.map((f) => f.trunk?.lean)),
    trunkTilt: median(samples.map((f) => f.trunk?.tilt)),
    legHeight: median(samples.map((f) => f.legHeight)),
  }
}

function listParts(parts) {
  const names = parts.map((p) => PART_LABELS[p] ?? p)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
}

/**
 * @param exercise  entry from library.js
 * @param options.now     clock in ms (injectable for tests)
 * @param options.restMs  rest between sets
 */
export function createRepCounter(exercise, { now = () => performance.now(), restMs = DEFAULT_REST_MS } = {}) {
  const { rest, target, ideal } = exercise
  const span = target - rest
  const hyst = span * HYSTERESIS
  const deadband = span * PATH_DEADBAND

  let status = 'framing'
  let phase = 'START'
  let value = null
  let set = 1
  let reps = 0
  let missing = []
  let view = null
  let baseline = null
  let calibration = null // { start, samples[] }
  let rep = null // rep in progress
  let restUntil = 0
  let message = null // { text, kind, until }
  const history = []
  const faultSince = {}
  let activeFaults = []

  function say(text, kind, t, hold = MESSAGE_HOLD_MS) {
    message = { text, kind, until: t + hold }
  }

  function startRep(t) {
    rep = {
      start: t,
      lastT: t,
      startValue: value,
      peak: value,
      path: 0,
      lastSample: value,
      faults: new Set(),
      faultMs: {}, // how long each wrong movement was detected during this rep
      crossStreaks: {}, // blockAtTarget faults already starting when the target was crossed
      voidReason: null,
    }
  }

  function voidRep(reason, t) {
    if (rep.voidReason) return
    rep.voidReason = reason
    say(`Not counted — ${reason}`, 'error', t, 2500)
  }

  // Called on each crossing of the target. A blocking fault that is already
  // confirmed voids the rep now; one that has only just started voids it if
  // that same streak lasts long enough to be confirmed (see trackRep).
  function checkBlockAtTarget(t) {
    for (const id of exercise.blockAtTarget ?? []) {
      if (faultSince[id] == null) continue
      if (t - faultSince[id] >= FAULT_HOLD_MS) voidRep(RULES[id].message, t)
      else rep.crossStreaks[id] = faultSince[id]
    }
  }

  function trackRep(f, t) {
    const dt = t - rep.lastT
    rep.lastT = t
    rep.peak = Math.max(rep.peak, value)
    if (Math.abs(value - rep.lastSample) >= deadband) {
      rep.path += Math.abs(value - rep.lastSample)
      rep.lastSample = value
    }

    activeFaults = []
    for (const id of exercise.rules) {
      if (RULES[id].check(f, baseline) === true) {
        faultSince[id] ??= t
        rep.faultMs[id] = (rep.faultMs[id] ?? 0) + dt
        if (t - faultSince[id] >= FAULT_HOLD_MS) {
          activeFaults.push(id)
          rep.faults.add(id)
          if (rep.crossStreaks[id] === faultSince[id]) voidRep(RULES[id].message, t)
        }
      } else {
        delete faultSince[id]
        delete rep.crossStreaks[id]
      }
    }
  }

  function endRep() {
    rep = null
    activeFaults = []
    for (const id of Object.keys(faultSince)) delete faultSince[id]
  }

  function completeRep(t) {
    const durationMs = t - rep.start
    if (durationMs < MIN_REP_MS) return endRep()

    const main = exercise.mainFault
    if (main && (rep.faultMs[main] ?? 0) > durationMs * MAIN_FAULT_SHARE) voidRep(RULES[main].message, t)
    if (rep.voidReason) {
      history.push({
        set,
        rep: null,
        counted: false,
        reason: rep.voidReason,
        quality: null,
        faults: [...rep.faults],
        peak: Math.round(rep.peak * 10) / 10,
        durationMs: Math.round(durationMs),
      })
      say(`Not counted — ${rep.voidReason}`, 'error', t, 2500)
      return endRep()
    }

    // Range of motion: reaching `target` counts, reaching `ideal` scores full marks
    const rom = clamp01((rep.peak - rest) / (ideal - rest))
    // Smoothness: a clean up-and-down travels (peak − start) + (peak − end); jerky movement travels further
    const cleanPath = rep.peak - rep.startValue + (rep.peak - value)
    let smoothness = rep.path > 0 ? clamp01(cleanPath / rep.path) : 1
    const tooFast = durationMs < FAST_REP_MS
    if (tooFast) smoothness *= 0.6
    const faults = [...rep.faults]
    const form = clamp01(1 - 0.5 * faults.length)
    const quality = Math.round(40 * rom + 30 * smoothness + 30 * form)

    reps++
    history.push({
      set,
      rep: reps,
      counted: true,
      reason: null,
      quality,
      rom: Math.round(rom * 100),
      smoothness: Math.round(smoothness * 100),
      faults,
      peak: Math.round(rep.peak * 10) / 10,
      durationMs: Math.round(durationMs),
    })
    endRep()

    if (reps >= exercise.reps) {
      if (set < exercise.sets) {
        status = 'rest'
        restUntil = t + restMs
      } else {
        status = 'done'
      }
      return
    }
    if (faults.length) say(`Rep ${reps} — ${RULES[faults[0]].message}`, 'warn', t)
    else if (tooFast) say(`Rep ${reps} — good, now a little slower`, 'info', t)
    else say(quality >= 80 ? `Great rep! That's ${reps}` : `Good — that's ${reps}`, 'good', t)
  }

  function stepPhase(f, t) {
    if (rep) trackRep(f, t)

    switch (phase) {
      case 'START':
        if (value > rest + hyst) {
          phase = 'UP'
          startRep(t)
        }
        break
      case 'UP':
        if (value >= target) {
          phase = 'TOP'
          checkBlockAtTarget(t)
        } else if (value <= rest) {
          // Came back down without reaching the target: no rep
          if (rep.peak > rest + 2 * hyst) say(exercise.cues.partial, 'warn', t, 2500)
          phase = 'START'
          endRep()
        }
        break
      case 'TOP':
        if (value < target - hyst) phase = 'DOWN'
        break
      case 'DOWN':
        if (value >= target) {
          phase = 'TOP'
          checkBlockAtTarget(t)
        } else if (value <= rest) {
          phase = 'START'
          completeRep(t)
        }
        break
    }
  }

  function startNextSet(t) {
    set++
    reps = 0
    phase = 'START'
    status = 'active'
    endRep()
    say(`Set ${set} — ${exercise.cues.start.toLowerCase()}`, 'info', t, 2500)
  }

  function correction(t) {
    if (status === 'done') return { text: 'Exercise complete — well done!', kind: 'good' }
    if (status === 'rest') {
      const s = Math.ceil(Math.max(0, restUntil - t) / 1000)
      return { text: `Set ${set} complete! Rest — next set in ${s}s`, kind: 'good' }
    }
    if (missing.length) return { text: `Step back — make sure your ${listParts(missing)} can be seen`, kind: 'warn' }
    if (status === 'framing') return { text: exercise.setup, kind: 'info' }
    if (status === 'calibrating') {
      return value > rest
        ? { text: `Get into the start position. ${exercise.setup}`, kind: 'info' }
        : { text: 'Hold still…', kind: 'info' }
    }
    if (activeFaults.length) return { text: RULES[activeFaults[0]].message, kind: 'error' }
    if (message && t < message.until) return { text: message.text, kind: message.kind }
    const cue = { START: 'start', UP: 'up', TOP: 'top', DOWN: 'down' }[phase]
    return { text: exercise.cues[cue], kind: 'info' }
  }

  function snapshot(t = now()) {
    const counted = history.filter((r) => r.counted)
    const done = counted.filter((r) => r.set === set)
    return {
      status,
      phase,
      set,
      sets: exercise.sets,
      reps,
      targetReps: exercise.reps,
      totalReps: counted.length,
      attempts: history.length, // counted + not counted
      value: value == null ? null : Math.round(value * 10) / 10,
      view,
      viewMismatch: view != null && view !== exercise.view,
      missing,
      activeFaults,
      calibrationProgress:
        status === 'calibrating' && calibration ? clamp01((t - calibration.start) / CALIBRATION_MS) : 0,
      restRemainingMs: status === 'rest' ? Math.max(0, restUntil - t) : 0,
      lastRep: counted.at(-1) ?? null, // last counted rep
      lastAttempt: history.at(-1) ?? null,
      setAverage: done.length ? Math.round(done.reduce((s, r) => s + r.quality, 0) / done.length) : null,
      history: history.slice(),
      correction: correction(t),
    }
  }

  function update(landmarks, width = 1, height = 1) {
    const t = now()
    if (status === 'done') return snapshot(t)
    if (status === 'rest') {
      if (t < restUntil) return snapshot(t)
      startNextSet(t)
    }

    const f = extractFeatures(landmarks, width, height)
    missing = f ? exercise.required.filter((p) => !f.visible[p]) : exercise.required
    if (missing.length) {
      // Pause; restart calibration when the person is back in frame
      if (status === 'calibrating') status = 'framing'
      activeFaults = []
      return snapshot(t)
    }
    view = f.view

    const raw = exercise.metric(f, baseline)
    if (raw == null) return snapshot(t)
    value = value == null ? raw : value + SMOOTHING * (raw - value)

    if (status === 'framing') {
      status = 'calibrating'
      calibration = { start: t, samples: [] }
    }

    if (status === 'calibrating') {
      if (value > rest) {
        calibration = { start: t, samples: [] }
      } else {
        calibration.samples.push(f)
        if (t - calibration.start >= CALIBRATION_MS) {
          baseline = makeBaseline(calibration.samples)
          calibration = null
          status = 'active'
          phase = 'START'
          say(`Ready! ${exercise.cues.start}`, 'good', t, 2500)
        }
      }
      return snapshot(t)
    }

    stepPhase(f, t)
    return snapshot(t)
  }

  /** End the rest early and start the next set. */
  function skipRest() {
    if (status === 'rest') startNextSet(now())
    return snapshot()
  }

  return { exercise, update, skipRest, snapshot }
}
