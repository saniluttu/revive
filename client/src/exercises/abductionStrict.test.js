// Strict shoulder abduction (ABDUCTION in library.js): synthetic pose sequences
// for each way of cheating — none may count — and one correct slow rep that must.

import { describe, expect, it } from 'vitest'
import { LM } from '../pose/angles.js'
import { getExercise } from './library.js'
import { CALIBRATION_MS, createRepCounter } from './repCounter.js'

const FRAME_MS = 33
const rad = (d) => (d * Math.PI) / 180

/**
 * Front-view standing pose (normalised coords, y down). The patient's left arm
 * (image right) is the working arm; the right arm hangs at 10°.
 *   abd   – raise out to the side, degrees from hanging down
 *   flex  – raise forward towards the camera, degrees (foreshortens the arm on screen)
 *   elbow – elbow angle (180 = straight)
 *   shift – whole body moved sideways (dancing / swaying)
 *   wristVis – visibility of the working wrist
 */
function pose({ abd = 10, flex = 0, elbow = 180, shift = 0, wristVis = 1 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  const set = (i, x, y, visibility = 1) => (lm[i] = { x: x + shift, y, visibility })
  const shY = 0.25
  set(LM.LEFT_HIP, 0.57, 0.5)
  set(LM.RIGHT_HIP, 0.43, 0.5)
  set(LM.LEFT_SHOULDER, 0.6, shY)
  set(LM.RIGHT_SHOULDER, 0.4, shY)
  set(LM.NOSE, 0.5, shY - 0.1)
  set(LM.LEFT_EAR, 0.53, shY - 0.1)
  set(LM.RIGHT_EAR, 0.47, shY - 0.1)
  set(LM.LEFT_KNEE, 0.57, 0.7)
  set(LM.RIGHT_KNEE, 0.43, 0.7)
  set(LM.LEFT_ANKLE, 0.57, 0.9)
  set(LM.RIGHT_ANKLE, 0.43, 0.9)

  // Working arm: 3D direction (out, down, towards camera) projected onto the image
  const seg = 0.12
  const up = { x: Math.sin(rad(abd)), y: Math.cos(rad(abd)) * Math.cos(rad(flex)) }
  const elbowPt = { x: 0.6 + up.x * seg, y: shY + up.y * seg }
  const bend = rad(180 - elbow) // forearm turns up/inwards
  const fore = { x: up.x * Math.cos(bend) + up.y * Math.sin(bend), y: -up.x * Math.sin(bend) + up.y * Math.cos(bend) }
  set(LM.LEFT_ELBOW, elbowPt.x, elbowPt.y)
  set(LM.LEFT_WRIST, elbowPt.x + fore.x * seg, elbowPt.y + fore.y * seg, wristVis)

  const rest = rad(10)
  set(LM.RIGHT_ELBOW, 0.4 - Math.sin(rest) * seg, shY + Math.cos(rest) * seg)
  set(LM.RIGHT_WRIST, 0.4 - Math.sin(rest) * seg * 2, shY + Math.cos(rest) * seg * 2)
  return lm
}

function harness() {
  let t = 0
  const counter = createRepCounter(getExercise('shoulder-abduction'), { now: () => t })
  let snap = counter.snapshot()
  const feed = (p, ms = FRAME_MS) => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      t += FRAME_MS
      snap = counter.update(typeof p === 'function' ? p(t) : p, 1000, 1000)
    }
    return snap
  }
  /** Move from a to b over ms; `make(x, t)` builds the pose. */
  const move = (make, a, b, ms) => {
    const steps = Math.max(1, Math.round(ms / FRAME_MS))
    for (let i = 1; i <= steps; i++) feed((now) => make(a + ((b - a) * i) / steps, now))
    return snap
  }
  feed(pose(), CALIBRATION_MS + 200)
  return { feed, move, get snap() { return snap } }
}

/** A correct rep: 2 s up, 0.8 s hold, 2 s down, 0.7 s rest. `extra(t)` adds pose options. */
function slowRep(h, { top = 95, extra = () => ({}) } = {}) {
  h.move((abd, t) => pose({ abd, ...extra(t) }), 10, top, 2000)
  h.feed((t) => pose({ abd: top, ...extra(t) }), 800)
  h.move((abd, t) => pose({ abd, ...extra(t) }), top, 10, 2000)
  h.feed((t) => pose({ ...extra(t) }), 700)
  return h.snap
}

const notCounted = (s, reason) => {
  expect(s.reps).toBe(0)
  expect(s.lastAttempt).toMatchObject({ counted: false, reason })
}

describe('strict shoulder abduction', () => {
  it('counts a correct slow rep: from rest, 2 s up, hold at the top, 2 s down', () => {
    const h = harness()
    expect(h.snap.status).toBe('active')
    const s = slowRep(h)
    expect(s.reps).toBe(1)
    expect(s.lastRep).toMatchObject({ counted: true, faults: [] })
    // …and the next one after resting
    expect(slowRep(h).reps).toBe(2)
  })

  it('still counts a correct rep with landmark jitter (±3° on the arm, small body wobble)', () => {
    const h = harness()
    let seed = 7
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 // deterministic −1…1
    const jitter = () => ({ shift: 0.004 * noise() })
    h.move((abd, t) => pose({ abd: abd + 3 * noise(), ...jitter(t) }), 10, 95, 2500)
    h.feed(() => pose({ abd: 95 + 3 * noise(), ...jitter() }), 900)
    h.move((abd, t) => pose({ abd: abd + 3 * noise(), ...jitter(t) }), 95, 10, 2500)
    h.feed(() => pose({ abd: 10 + 3 * noise(), ...jitter() }), 700)
    expect(h.snap.reps).toBe(1)
  })

  it('too fast: a quick up-and-down is not counted (slowDown)', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 95, 500)
    h.feed(pose({ abd: 95 }), 200)
    h.move((abd) => pose({ abd }), 95, 10, 500)
    h.feed(pose(), 300)
    notCounted(h.snap, 'slowDown')
  })

  it('too fast: sweeping through the top without holding it is not counted (slowDown)', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 95, 2000)
    h.move((abd) => pose({ abd }), 95, 10, 2000)
    h.feed(pose(), 300)
    notCounted(h.snap, 'slowDown')
  })

  it('no rest: going straight into the next rep is not counted (slowDown)', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 95, 2000)
    h.feed(pose({ abd: 95 }), 800)
    h.move((abd) => pose({ abd }), 95, 10, 2000)
    expect(h.snap.reps).toBe(1)
    h.feed(pose(), 100) // not the 0.5 s still rest
    slowRep(h)
    expect(h.snap.reps).toBe(1)
    expect(h.snap.lastAttempt).toMatchObject({ counted: false, reason: 'slowDown' })
  })

  it('dancing: swaying the hips and feet is not counted (standStill)', () => {
    const h = harness()
    const sway = (t) => ({ shift: 0.03 * Math.sin(t / 150) })
    notCounted(slowRep(h, { extra: sway }), 'standStill')
  })

  it('waving: bouncing the arm down and up at the top is not counted (smooth)', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 95, 2000)
    h.feed(pose({ abd: 95 }), 600)
    for (let i = 0; i < 3; i++) {
      h.move((abd) => pose({ abd }), 95, 65, 300)
      h.move((abd) => pose({ abd }), 65, 95, 300)
    }
    expect(h.snap.rejected).toBe('smooth')
    h.move((abd) => pose({ abd }), 95, 10, 2000)
    h.feed(pose(), 300)
    notCounted(h.snap, 'smooth')
  })

  it('raising too high: above 120° is not counted (tooHigh), and the patient is told at once', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 150, 4000)
    expect(h.snap.rejected).toBe('tooHigh')
    expect(h.snap.activeFaults).toContain('tooHigh')
    h.feed(pose({ abd: 150 }), 800)
    h.move((abd) => pose({ abd }), 150, 10, 2500)
    h.feed(pose(), 300)
    notCounted(h.snap, 'tooHigh')
  })

  it('bent elbow: is not counted (straightArm)', () => {
    const h = harness()
    notCounted(slowRep(h, { extra: () => ({ elbow: 110 }) }), 'straightArm')
  })

  it('forward swing: raising the arm towards the camera is not counted (sideways)', () => {
    const h = harness()
    // Partly out, mostly forward: on screen the angle still reaches ~90°
    h.move((x) => pose({ abd: 10 + 25 * x, flex: 90 * x }), 0, 1, 2000)
    expect(h.snap.value).toBeGreaterThan(75)
    h.feed(pose({ abd: 35, flex: 90 }), 800)
    h.move((x) => pose({ abd: 10 + 25 * x, flex: 90 * x }), 1, 0, 2000)
    h.feed(pose(), 300)
    notCounted(h.snap, 'sideways')
  })

  it('pauses with "step back" while the working wrist is hard to see, then carries on', () => {
    const h = harness()
    h.move((abd) => pose({ abd }), 10, 60, 1000)
    const paused = h.feed(pose({ abd: 60, wristVis: 0.3 }), 300)
    expect(paused.activeFaults).toEqual(['stepBack'])
    expect(paused.correction).toMatchObject({ key: 'rules.stepBack' })
    expect(paused.phase).toBe('START') // the rep in progress was dropped
    h.move((abd) => pose({ abd }), 60, 10, 1000)
    h.feed(pose(), 700) // rest still before the next rep
    expect(h.snap.activeFaults).toEqual([])
    expect(slowRep(h).reps).toBe(1)
  })
})
