import { describe, expect, it } from 'vitest'
import i18n from '../i18n/index.js'
import { translateMessage } from '../i18n/message.js'
import { LM } from '../pose/angles.js'
import { getExercise } from './library.js'
import { CALIBRATION_MS, createRepCounter } from './repCounter.js'

const FRAME_MS = 33
const en = i18n.getFixedT('en')
const text = (m) => translateMessage(en, m, 'en')
const rad = (d) => (d * Math.PI) / 180

/**
 * Synthetic front-view standing pose in normalised coords (y down).
 * arm: shoulder angle in degrees (0 = arms down, 90 = out to the side)
 * shrug: how far the shoulders rise (normalised units)
 * lean: sideways trunk tilt in degrees
 * drop: how far the hips drop (normalised units)
 */
function frontPose({ arm = 10, shrug = 0, lean = 0, drop = 0, kneesIn = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  const set = (i, x, y) => (lm[i] = { x, y, visibility: 1 })
  const hipY = 0.5 + drop
  const torso = 0.25
  const dx = Math.sin(rad(lean)) * torso
  const shY = hipY - Math.cos(rad(lean)) * torso - shrug
  set(LM.LEFT_HIP, 0.57, hipY)
  set(LM.RIGHT_HIP, 0.43, hipY)
  set(LM.LEFT_SHOULDER, 0.6 + dx, shY)
  set(LM.RIGHT_SHOULDER, 0.4 + dx, shY)
  set(LM.NOSE, 0.5 + dx, shY - 0.1 + shrug)
  set(LM.LEFT_EAR, 0.53 + dx, shY - 0.1 + shrug)
  set(LM.RIGHT_EAR, 0.47 + dx, shY - 0.1 + shrug)
  // Arms point straight down at 0°, sideways at 90° (measured from the hip direction)
  const armLen = 0.12
  set(LM.LEFT_ELBOW, 0.6 + dx + Math.sin(rad(arm)) * armLen, shY + Math.cos(rad(arm)) * armLen)
  set(LM.RIGHT_ELBOW, 0.4 + dx - Math.sin(rad(arm)) * armLen, shY + Math.cos(rad(arm)) * armLen)
  set(LM.LEFT_WRIST, 0.6 + dx + Math.sin(rad(arm)) * armLen * 2, shY + Math.cos(rad(arm)) * armLen * 2)
  set(LM.RIGHT_WRIST, 0.4 + dx - Math.sin(rad(arm)) * armLen * 2, shY + Math.cos(rad(arm)) * armLen * 2)
  set(LM.LEFT_KNEE, 0.57 - kneesIn, 0.7 + drop / 2)
  set(LM.RIGHT_KNEE, 0.43 + kneesIn, 0.7 + drop / 2)
  set(LM.LEFT_ANKLE, 0.57, 0.9)
  set(LM.RIGHT_ANKLE, 0.43, 0.9)
  return lm
}

function harness(exerciseId, opts) {
  let t = 0
  const counter = createRepCounter(getExercise(exerciseId), { now: () => t, ...opts })
  let snap = counter.snapshot()
  const feed = (pose, ms = FRAME_MS) => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      t += FRAME_MS
      snap = counter.update(pose, 1000, 1000)
    }
    return snap
  }
  // Linear move of one pose parameter from a → b over `ms`
  const move = (makePose, a, b, ms) => {
    const steps = Math.max(1, Math.round(ms / FRAME_MS))
    for (let i = 1; i <= steps; i++) feed(makePose(a + ((b - a) * i) / steps))
    return snap
  }
  const calibrate = (pose) => feed(pose, CALIBRATION_MS + 200)
  return { counter, feed, move, calibrate, get snap() { return snap }, advance: (ms) => (t += ms) }
}

describe('shoulder abduction', () => {
  const arm = (a, extra) => frontPose({ arm: a, ...extra })

  it('calibrates, then counts a full rep with a high quality score', () => {
    const h = harness('shoulder-abduction')
    expect(h.feed(arm(10)).status).toBe('calibrating')
    expect(h.calibrate(arm(10)).status).toBe('active')

    h.move((a) => arm(a), 10, 95, 2000)
    expect(h.snap.phase).toBe('TOP')
    h.feed(arm(95), 700)
    h.move((a) => arm(a), 95, 10, 2000)

    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastRep.faults).toEqual([])
    expect(h.snap.lastRep.quality).toBeGreaterThanOrEqual(90)
  })

  it('does not count a rep that never reaches the target and asks to go higher', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    h.move((a) => arm(a), 10, 55, 1000)
    h.move((a) => arm(a), 55, 10, 1000)
    expect(h.snap.reps).toBe(0)
    expect(text(h.snap.correction)).toMatch(/higher/i)
  })

  it('flags shoulder shrug and lowers the quality score', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    h.move((a) => arm(a), 10, 95, 2000)
    // shoulders rise by 0.04 → ear gap 0.1 → 0.06 (40% drop)
    h.move((s) => arm(95, { shrug: s }), 0, 0.04, 300)
    h.feed(arm(95, { shrug: 0.04 }), 400)
    expect(h.snap.activeFaults).toContain('shrug')
    expect(h.snap.correction.kind).toBe('error')
    h.move((a) => arm(a), 95, 10, 2000)

    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastRep.faults).toContain('shrug')
    expect(h.snap.lastRep.quality).toBeLessThanOrEqual(85)
  })

  it('flags leaning sideways', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    h.move((a) => arm(a), 10, 60, 600)
    h.feed(arm(80, { lean: 15 }), 500)
    expect(h.snap.activeFaults).toContain('leanSideways')
  })

  it('ignores a brief one-frame glitch in form', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    h.move((a) => arm(a), 10, 95, 2000)
    h.feed(arm(95, { lean: 20 }), FRAME_MS)
    h.feed(arm(95), 700)
    h.move((a) => arm(a), 95, 10, 2000)
    expect(h.snap.lastRep.faults).toEqual([])
  })

  it('pauses when the body leaves the frame', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    const s = h.feed(null)
    expect(s.missing.length).toBeGreaterThan(0)
    expect(text(s.correction)).toMatch(/step back — make sure your shoulders, elbows, and hips can be seen/i)
  })

  it('moves to rest after a set and finishes after the last set', () => {
    const h = harness('shoulder-abduction', { restMs: 5000 })
    h.calibrate(arm(10))
    const doRep = () => {
      h.move((a) => arm(a), 10, 95, 2000)
      h.feed(arm(95), 700)
      h.move((a) => arm(a), 95, 10, 2000)
      h.feed(arm(10), 700)
    }
    for (let i = 0; i < 10; i++) doRep()
    expect(h.snap.status).toBe('rest')
    expect(text(h.snap.correction)).toMatch(/set 1 complete/i)

    h.counter.skipRest()
    expect(h.counter.snapshot().set).toBe(2)
    for (let i = 0; i < 10; i++) doRep()
    expect(h.snap.status).toBe('done')
    expect(h.snap.totalReps).toBe(20)
  })
})

describe('shoulder abduction — shrug compensation', () => {
  const pose = (arm, shrug = 0) => frontPose({ arm, shrug })
  const SHRUG = 0.04 // shoulders (and arms) lift 0.04 → ear gap 0.1 → 0.06, a 40% drop
  const SHRUG_MSG = "Relax your shoulder, don't lift it"

  function lowerAndFinish(h, from = 95) {
    h.move((a) => pose(a), from, 10, 2000)
    h.feed(pose(10), 200)
    return h.snap
  }

  it('a partial raise with a shrug is not inflated into a full rep', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(pose(10))
    h.move((a) => pose(a), 10, 65, 1000)
    h.move((s) => pose(65, s), 0, SHRUG, 300)
    h.feed(pose(65, SHRUG), 600)
    expect(h.snap.value).toBeLessThan(75)
    expect(h.snap.phase).toBe('UP')
    expect(text(h.snap.correction)).toBe(SHRUG_MSG)
    lowerAndFinish(h, 65)
    expect(h.snap.reps).toBe(0)
  })

  it('does not count a rep when a shrug is already active as the arm crosses the target', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(pose(10))
    h.move((a) => pose(a), 10, 60, 800)
    h.feed(pose(60, SHRUG), 400) // confirmed shrug before reaching the target
    h.move((a) => pose(a, SHRUG), 60, 95, 600)
    expect(h.snap.phase).toBe('TOP')
    expect(h.snap.correction).toMatchObject({ key: 'rules.shrug', kind: 'error' })
    const s = lowerAndFinish(h)

    expect(s.reps).toBe(0)
    expect(s.totalReps).toBe(0)
    expect(s.attempts).toBe(1)
    expect(s.lastAttempt).toMatchObject({ counted: false, reason: 'shrug', quality: null })
    expect(text(s.correction)).toBe(`Not counted — ${SHRUG_MSG}`)
  })

  it('does not count a rep when a shrug starts right as the arm crosses the target', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(pose(10))
    h.move((a) => pose(a), 10, 62, 2000)
    expect(h.snap.phase).toBe('UP')
    h.feed(pose(95, SHRUG)) // crosses the target on the same frame the shrug begins
    expect(h.snap.phase).toBe('TOP')
    h.feed(pose(95, SHRUG), 400) // the same shrug streak is then confirmed
    const s = lowerAndFinish(h)
    expect(s.reps).toBe(0)
    expect(s.lastAttempt).toMatchObject({ counted: false, reason: 'shrug' })
  })

  it('still counts the rep (with a lower score) when a short shrug happens only after the target', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(pose(10))
    h.move((a) => pose(a), 10, 95, 2000)
    h.feed(pose(95), 300)
    h.feed(pose(95, SHRUG), 400)
    h.feed(pose(95), 300)
    const s = lowerAndFinish(h)
    expect(s.reps).toBe(1)
    expect(s.lastRep.counted).toBe(true)
    expect(s.lastRep.faults).toContain('shrug')
    expect(s.lastRep.quality).toBeLessThan(90)
  })

  it('does not count a rep when the shrug is held for most of the rep', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(pose(10))
    h.move((a) => pose(a), 10, 95, 2000) // reaches the target cleanly…
    h.feed(pose(95, SHRUG), 3000) // …then shrugs for the rest of the rep
    h.move((a) => pose(a, SHRUG), 95, 10, 2000)
    h.feed(pose(10), 200)
    expect(h.snap.reps).toBe(0)
    expect(h.snap.lastAttempt).toMatchObject({ counted: false, reason: 'shrug' })
  })
})

describe('mini squat (front view)', () => {
  const squat = (drop, kneesIn = 0) => frontPose({ drop, kneesIn })

  it('counts a squat from hip drop', () => {
    const h = harness('mini-squat')
    h.calibrate(squat(0))
    expect(h.snap.status).toBe('active')
    // 0.4 leg height → 0.03 drop = 7.5%
    h.move((d) => squat(d), 0, 0.03, 1000)
    expect(h.snap.phase).toBe('TOP')
    h.move((d) => squat(d), 0.03, 0, 1000)
    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastRep.faults).toEqual([])
  })

  it('counts a rep with a brief knee cave but flags it', () => {
    const h = harness('mini-squat')
    h.calibrate(squat(0))
    h.move((d) => squat(d), 0, 0.03, 1200)
    h.feed(squat(0.03, 0.03), 400)
    h.move((d) => squat(d), 0.03, 0, 1200)
    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastRep.faults).toContain('kneesIn')
  })

  it('does not count a rep where the knees cave in for most of it', () => {
    const h = harness('mini-squat')
    h.calibrate(squat(0))
    h.move((d) => squat(d, d), 0, 0.03, 1000)
    h.feed(squat(0.03, 0.03), 400)
    h.move((d) => squat(d, d), 0.03, 0, 1000)
    expect(h.snap.reps).toBe(0)
    expect(h.snap.lastAttempt).toMatchObject({ counted: false, reason: 'kneesIn' })
  })
})
