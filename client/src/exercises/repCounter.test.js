import { describe, expect, it } from 'vitest'
import { LM } from '../pose/angles.js'
import { getExercise } from './library.js'
import { CALIBRATION_MS, createRepCounter } from './repCounter.js'

const FRAME_MS = 33
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

    h.move((a) => arm(a), 10, 95, 1500)
    expect(h.snap.phase).toBe('TOP')
    h.move((a) => arm(a), 95, 10, 1500)

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
    expect(h.snap.correction.text).toMatch(/higher/i)
  })

  it('flags shoulder shrug and lowers the quality score', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    h.move((a) => arm(a), 10, 95, 1000)
    // shoulders rise by 0.04 → ear gap 0.1 → 0.06 (40% drop)
    h.move((s) => arm(95, { shrug: s }), 0, 0.04, 300)
    h.feed(arm(95, { shrug: 0.04 }), 400)
    expect(h.snap.activeFaults).toContain('shrug')
    expect(h.snap.correction.kind).toBe('error')
    h.move((a) => arm(a), 95, 10, 1500)

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
    h.move((a) => arm(a), 10, 95, 1000)
    h.feed(arm(95, { lean: 20 }), FRAME_MS)
    h.move((a) => arm(a), 95, 10, 1500)
    expect(h.snap.lastRep.faults).toEqual([])
  })

  it('pauses when the body leaves the frame', () => {
    const h = harness('shoulder-abduction')
    h.calibrate(arm(10))
    const s = h.feed(null)
    expect(s.missing.length).toBeGreaterThan(0)
    expect(s.correction.text).toMatch(/step back/i)
  })

  it('moves to rest after a set and finishes after the last set', () => {
    const h = harness('shoulder-abduction', { restMs: 5000 })
    h.calibrate(arm(10))
    const doRep = () => {
      h.move((a) => arm(a), 10, 95, 1000)
      h.move((a) => arm(a), 95, 10, 1000)
      h.feed(arm(10), 200)
    }
    for (let i = 0; i < 10; i++) doRep()
    expect(h.snap.status).toBe('rest')
    expect(h.snap.correction.text).toMatch(/set 1 complete/i)

    h.counter.skipRest()
    expect(h.counter.snapshot().set).toBe(2)
    for (let i = 0; i < 10; i++) doRep()
    expect(h.snap.status).toBe('done')
    expect(h.snap.totalReps).toBe(20)
  })
})

describe('mini squat (front view)', () => {
  it('counts a squat from hip drop and flags knees caving in', () => {
    const h = harness('mini-squat')
    h.calibrate(frontPose())
    expect(h.snap.status).toBe('active')

    // 0.4 leg height → 0.03 drop = 7.5%
    h.move((d) => frontPose({ drop: d }), 0, 0.03, 1000)
    expect(h.snap.phase).toBe('TOP')
    h.move((d) => frontPose({ drop: d }), 0.03, 0, 1000)
    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastRep.faults).toEqual([])

    h.move((d) => frontPose({ drop: d, kneesIn: d }), 0, 0.03, 1000)
    h.feed(frontPose({ drop: 0.03, kneesIn: 0.03 }), 400)
    h.move((d) => frontPose({ drop: d }), 0.03, 0, 1000)
    expect(h.snap.reps).toBe(2)
    expect(h.snap.lastRep.faults).toContain('kneesIn')
  })
})
