// Rep counting state machine + form monitoring + per-rep quality (F6).
//
// Session status:  framing → calibrating → active ⇄ rest → done
// Rep phases:      START → UP → TOP → DOWN → START  = 1 rep, only if TOP (target ROM) was reached
// A rep that reached the target is still "not counted" when:
//   - a `blockAtTarget` fault (e.g. shrug) was active as the target was crossed, or
//   - the exercise's `mainFault` was held for most of the rep
// Exercises with a `strict` config (shoulder abduction, see ABDUCTION in library.js)
// are also checked for: starting from a still rest, tempo, a hold at the top, an
// upper limit and a single smooth peak; form rules listed in `voidOn` void the rep.
//
// Pure JS (no React) so it can be unit-tested with synthetic poses. On-screen
// text is returned as translatable messages ({ key, values }, see i18n/message.js);
// `reason` in history is the rule id of the wrong movement.

import { msg } from '../i18n/message.js'
import { extractFeatures } from './body.js'
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

const medianPoint = (points) => {
  const x = median(points.map((p) => p?.x))
  return x == null ? null : { x, y: median(points.map((p) => p?.y)) }
}

function makeBaseline(samples) {
  const sidePoint = (side, part) => medianPoint(samples.map((f) => f.sides[side].points[part]))
  const armLength = (side) =>
    median(
      samples.map((f) => {
        const { shoulder, wrist } = f.sides[side].points
        return shoulder && wrist ? Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y) : null
      }),
    )
  return {
    armLength: { left: armLength('left'), right: armLength('right') },
    shoulderWidth: median(samples.map((f) => f.shoulderWidth)),
    hipMid: medianPoint(samples.map((f) => f.hipMid)),
    ankles: { left: sidePoint('left', 'ankle'), right: sidePoint('right', 'ankle') },
    earShoulder: {
      left: median(samples.map((f) => f.earShoulder.left)),
      right: median(samples.map((f) => f.earShoulder.right)),
    },
    trunkLean: median(samples.map((f) => f.trunk?.lean)),
    trunkTilt: median(samples.map((f) => f.trunk?.tilt)),
    legHeight: median(samples.map((f) => f.legHeight)),
  }
}

const ruleMsg = (id) => msg(`rules.${id}`)

/**
 * @param exercise  entry from library.js
 * @param options.now     clock in ms (injectable for tests)
 * @param options.restMs  rest between sets
 */
export function createRepCounter(exercise, { now = () => performance.now(), restMs = DEFAULT_REST_MS } = {}) {
  const { rest, target, ideal } = exercise
  const cue = (name) => msg(`exercises.${exercise.id}.cues.${name}`)
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
  let message = null // { message, kind, until }
  // strict mode: the arm must rest still before a rep can start
  const strict = exercise.strict ?? null
  let restAnchor = null // { t, lo, hi } while the arm is down and the angle stays within restStillDeg
  let armed = false // rested long enough for the next rep
  let lastRestT = 0 // last frame with the arm down
  let lastReject = null // most recent reason a rep was not counted (debug overlay)
  let elbow = null // working arm's elbow angle (debug overlay)
  const history = []
  const faultSince = {}
  let activeFaults = []

  function say(m, kind, t, hold = MESSAGE_HOLD_MS) {
    message = { ...m, kind, until: t + hold }
  }

  function startRep(t, side) {
    rep = {
      start: t,
      side, // strict: visibility is checked on this arm until the rep ends
      lastT: t,
      startValue: value,
      peak: value,
      path: 0,
      lastSample: value,
      faults: new Set(),
      faultMs: {}, // how long each wrong movement was detected during this rep
      crossStreaks: {}, // blockAtTarget faults already starting when the target was crossed
      voidReason: null,
      lastRestT, // the up phase is timed from here
      holdMs: 0, // time at or above the target
      lastTopT: null, // the down phase is timed from here
      trend: { dir: 'up', extreme: value }, // turning points beyond jitterDeg
      peaks: 0,
    }
    if (strict && !armed) voidRep('slowDown', t)
  }

  function voidRep(reason, t) {
    if (rep.voidReason) return
    rep.voidReason = reason
    lastReject = reason
    say(msg('cues.notCounted', { reason: ruleMsg(reason) }), 'error', t, 2500)
  }

  // Called on each crossing of the target. A blocking fault that is already
  // confirmed voids the rep now; one that has only just started voids it if
  // that same streak lasts long enough to be confirmed (see trackRep).
  function checkBlockAtTarget(t) {
    for (const id of exercise.blockAtTarget ?? []) {
      if (faultSince[id] == null) continue
      if (t - faultSince[id] >= FAULT_HOLD_MS) voidRep(id, t)
      else rep.crossStreaks[id] = faultSince[id]
    }
  }

  function trackRep(f, t) {
    const dt = t - rep.lastT
    rep.lastT = t
    rep.peak = Math.max(rep.peak, value)
    if (value >= target) {
      if (rep.lastTopT != null) rep.holdMs += dt
      rep.lastTopT = t
    }
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
          if (rep.crossStreaks[id] === faultSince[id] || exercise.voidOn?.includes(id)) voidRep(id, t)
        }
      } else {
        delete faultSince[id]
        delete rep.crossStreaks[id]
      }
    }

    if (strict) trackTrend(t)
    if (strict && value > strict.maxPeak) {
      activeFaults.push('tooHigh')
      voidRep('tooHigh', t)
    }
  }

  // One smooth up-and-down: a fall of more than jitterDeg is a peak; rising
  // again by more than jitterDeg after it is a second peak (waving, bouncing).
  function trackTrend(t) {
    const trend = rep.trend
    if (trend.dir === 'up') {
      if (value > trend.extreme) trend.extreme = value
      else if (value < trend.extreme - strict.jitterDeg) {
        rep.peaks++
        rep.trend = { dir: 'down', extreme: value }
      }
    } else if (value < trend.extreme) trend.extreme = value
    else if (value > trend.extreme + strict.jitterDeg) {
      voidRep('smooth', t)
      rep.trend = { dir: 'up', extreme: value }
    }
  }

  function endRep() {
    rep = null
    armed = false
    restAnchor = null
    activeFaults = []
    for (const id of Object.keys(faultSince)) delete faultSince[id]
  }

  function rejectRep(t) {
    history.push({
      set,
      rep: null,
      counted: false,
      reason: rep.voidReason,
      quality: null,
      faults: [...rep.faults],
      peak: Math.round(rep.peak * 10) / 10,
      durationMs: Math.round(t - rep.start),
    })
    say(msg('cues.notCounted', { reason: ruleMsg(rep.voidReason) }), 'error', t, 2500)
    endRep()
  }

  function completeRep(t) {
    const durationMs = t - rep.start
    if (durationMs < MIN_REP_MS) return endRep()

    const main = exercise.mainFault
    if (main && (rep.faultMs[main] ?? 0) > durationMs * MAIN_FAULT_SHARE) voidRep(main, t)
    if (rep.voidReason) return rejectRep(t)

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
    if (faults.length) say(msg('cues.repFault', { n: reps, reason: ruleMsg(faults[0]) }), 'warn', t)
    else if (tooFast) say(msg('cues.repTooFast', { n: reps }), 'info', t)
    else say(msg(quality >= 80 ? 'cues.repGreat' : 'cues.repGood', { n: reps }), 'good', t)
  }

  function trackRest(t) {
    if (value > strict.restMax) {
      restAnchor = null
      return
    }
    lastRestT = t
    if (restAnchor) {
      restAnchor.lo = Math.min(restAnchor.lo, value)
      restAnchor.hi = Math.max(restAnchor.hi, value)
    }
    if (!restAnchor || restAnchor.hi - restAnchor.lo > strict.restStillDeg) restAnchor = { t, lo: value, hi: value }
    if (!rep && t - restAnchor.t >= strict.restHoldMs) armed = true
  }

  function stepPhase(f, t) {
    if (strict) trackRest(t)
    if (rep) trackRep(f, t)

    switch (phase) {
      case 'START':
        if (value > rest + hyst) {
          phase = 'UP'
          startRep(t, f.working)
        }
        break
      case 'UP':
        if (value >= target) {
          phase = 'TOP'
          rep.upMs = t - rep.lastRestT
          if (strict && rep.upMs < strict.minUpMs) voidRep('slowDown', t)
          checkBlockAtTarget(t)
        } else if (value <= rest) {
          // Came back down without reaching the target: no rep
          phase = 'START'
          if (rep.voidReason && rep.peak > rest + 2 * hyst) return rejectRep(t)
          if (rep.peak > rest + 2 * hyst) say(cue('partial'), 'warn', t, 2500)
          endRep()
        }
        break
      case 'TOP':
        if (value < target - hyst) {
          phase = 'DOWN'
          if (strict && rep.holdMs < strict.minHoldMs) voidRep('slowDown', t)
        }
        break
      case 'DOWN':
        if (value >= target) {
          phase = 'TOP'
          checkBlockAtTarget(t)
        } else if (value <= rest) {
          phase = 'START'
          if (strict && t - rep.lastTopT < strict.minDownMs) voidRep('slowDown', t)
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
    armed = true // the rest between sets
    say(msg('cues.nextSet', { set, cue: cue('start') }), 'info', t, 2500)
  }

  function correction(t) {
    const setup = msg(`exercises.${exercise.id}.setup`)
    if (status === 'done') return { ...msg('cues.complete'), kind: 'good' }
    if (status === 'rest') {
      const seconds = Math.ceil(Math.max(0, restUntil - t) / 1000)
      return { ...msg('cues.rest', { set, seconds }), kind: 'good' }
    }
    if (missing.length) {
      return { ...msg('cues.stepBack', { parts: missing.map((p) => msg(`parts.${p}`)) }), kind: 'warn' }
    }
    if (status === 'framing') return { ...setup, kind: 'info' }
    if (status === 'calibrating') {
      return value > rest
        ? { ...msg('cues.startPosition', { setup }), kind: 'info' }
        : { ...msg('cues.holdStill'), kind: 'info' }
    }
    if (activeFaults.length) return { ...ruleMsg(activeFaults[0]), kind: 'error' }
    if (message && t < message.until) return { key: message.key, values: message.values, kind: message.kind }
    return { ...cue({ START: 'start', UP: 'up', TOP: 'top', DOWN: 'down' }[phase]), kind: 'info' }
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
      rejected: rep?.voidReason ?? null, // the rep in progress won't count, and why
      debug: {
        angle: value == null ? null : Math.round(value),
        elbow: elbow == null ? null : Math.round(elbow),
        side: rep?.side ?? null,
        armed,
        restMs: restAnchor ? Math.round(t - restAnchor.t) : 0,
        upMs: rep ? Math.round(rep.upMs ?? t - rep.lastRestT) : null,
        holdMs: rep ? Math.round(rep.holdMs) : null,
        downMs: rep && phase === 'DOWN' && rep.lastTopT != null ? Math.round(t - rep.lastTopT) : null,
        peak: rep ? Math.round(rep.peak) : null,
        peaks: rep?.peaks ?? null,
        lastReject,
      },
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

    // strict: pause while the working arm isn't seen clearly; a rep in progress is dropped
    if (strict && status === 'active') {
      const side = rep?.side ?? f.working
      const seen = side ? Object.values(f.sides[side].visibility) : []
      if (!seen.length || Math.min(...seen) < strict.minVisibility) {
        if (rep) {
          phase = 'START'
          endRep()
        }
        activeFaults = ['stepBack']
        return snapshot(t)
      }
      if (activeFaults[0] === 'stepBack') activeFaults = []
    }

    elbow = f.working ? f.sides[f.working].elbowAngle : null
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
          armed = true // calibration was a rest held long enough
          say(msg('cues.ready', { cue: cue('start') }), 'good', t, 2500)
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
