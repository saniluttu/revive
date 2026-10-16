// Keyframe motions for the avatar demonstration (F5), driven by joint angles.
//
// Each exercise has a start pose and a top pose; `pose(s)` blends between them
// for s = 0 (start) … 1 (top). The top uses the exercise's `ideal` from
// exercises/library.js, so the avatar shows exactly the range the rep counter
// scores as full. One rep runs through four phases:
//   rest → up → hold (at the top) → down
// and each phase lines up with the exercise's instruction step being read
// aloud (exercises.<id>.steps: 0 move, 1 form / hold, 2 return).

import { getExercise } from '../exercises/library.js'
import { BODY } from './rig.js'

export const PHASES = ['rest', 'up', 'hold', 'down']

/** Instruction step index for each phase (−1 = the setup line). */
export const PHASE_STEP = { rest: -1, up: 0, hold: 1, down: 2 }
/** Phase shown while a step is being read aloud. */
export const STEP_PHASE = { '-1': 'rest', 0: 'up', 1: 'hold', 2: 'down' }

// Seconds per phase at 1× — a calm physiotherapy tempo (≈2 s up, a short
// hold, a slower lowering).
const TEMPO = { rest: 1.2, up: 2, hold: 1.5, down: 2.5 }

const RAD = Math.PI / 180
const lerp = (a, b, s) => a + (b - a) * s
const lerp3 = (a, b, s) => [lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)]

/** Smooth start and stop. */
export const easeInOut = (p) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)))

/** Knee bend (°) that drops the hips by `pct` % — the inverse of library.js `squatDepth`. */
export function kneeFlexionForDepth(pct) {
  return (2 * Math.acos(1 - pct / 100)) / RAD
}

// The rep counter measures hip–shoulder–elbow, and the hip sits inside the
// shoulder, so the hip→shoulder line already leans out by this much (°).
const TORSO_TILT = Math.atan2(BODY.shoulderWidth - BODY.hipWidth, BODY.hipDrop + BODY.spine + BODY.chest + BODY.shoulderHeight) / RAD

// Relaxed standing: arms a touch away from the body, elbows soft.
const STAND = {
  shoulderL: [0, 0, 6],
  shoulderR: [0, 0, -6],
  elbowL: [-8, 0, 0],
  elbowR: [-8, 0, 0],
}

// Blend two joint maps.
function blend(from, to, s) {
  const out = {}
  for (const j of new Set([...Object.keys(from), ...Object.keys(to)])) {
    out[j] = lerp3(from[j] ?? [0, 0, 0], to[j] ?? [0, 0, 0], s)
  }
  return out
}

const MOTIONS = {
  // Both arms out to the sides to shoulder height, elbows straight.
  'shoulder-abduction': (ex) => {
    const top = ex.ideal - TORSO_TILT
    return {
      tempo: TEMPO,
      peak: { shoulder: ex.ideal },
      pose: (s) => ({
        root: [0, 0, 0],
        joints: blend(
          STAND,
          { ...STAND, shoulderL: [0, 0, top], shoulderR: [0, 0, -top], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0] },
          s,
        ),
      }),
    }
  },

  // The left arm (the side facing the side camera) forward and up, thumb up.
  'shoulder-flexion': (ex) => {
    const top = ex.ideal
    return {
      tempo: TEMPO,
      peak: { shoulder: top },
      pose: (s) => ({
        root: [0, 0, 0],
        joints: blend(STAND, { ...STAND, shoulderL: [-top, 25, 4], elbowL: [-3, 0, 0] }, s),
      }),
    }
  },

  // Knees bend to the ideal depth with feet planted: the shins and thighs tilt
  // by half the knee bend each, so the hips sink straight down over the feet;
  // chest up with a slight forward lean, arms reach forward for balance.
  'mini-squat': (ex) => {
    const knee = kneeFlexionForDepth(ex.ideal)
    const lean = 14
    return {
      tempo: { ...TEMPO, up: 2.2, down: 2.4 },
      peak: { knee },
      pose: (s) => {
        const k = knee * s
        const drop = (BODY.thigh + BODY.shin) * (1 - Math.cos((k / 2) * RAD))
        const thigh = -(k / 2) - lean * s // hip flexion includes the trunk lean
        return {
          root: [0, -drop, -0.03 * s],
          joints: {
            ...blend(STAND, { ...STAND, shoulderL: [-55, 0, 8], shoulderR: [-55, 0, -8], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0] }, s),
            pelvis: [lean * s, 0, 0],
            spine: [0, 0, 0],
            neck: [-lean * 0.8 * s, 0, 0], // keep looking ahead
            hipL: [thigh, 0, 2],
            hipR: [thigh, 0, -2],
            kneeL: [k, 0, 0],
            kneeR: [k, 0, 0],
            ankleL: [-(k / 2), 0, 0],
            ankleR: [-(k / 2), 0, 0],
          },
        }
      },
    }
  },

  // Seated on a chair (knees at 90°); the left knee straightens to the ideal
  // knee angle and holds, back against the chair, hands resting on the thighs.
  'seated-knee-extension': (ex) => {
    const startAngle = 90 // knee angle sitting with feet on the floor
    const top = ex.ideal
    const seated = {
      hipL: [-90, 0, 2],
      hipR: [-90, 0, -2],
      kneeL: [180 - startAngle, 0, 0],
      kneeR: [180 - startAngle, 0, 0],
      shoulderL: [-28, 0, 10],
      shoulderR: [-28, 0, -10],
      elbowL: [-48, 0, 0],
      elbowR: [-48, 0, 0],
    }
    return {
      tempo: { ...TEMPO, hold: 2.2 },
      peak: { knee: top },
      seated: true,
      pose: (s) => ({
        // hips at seat height: the shin hangs from the knee to the floor
        root: [0, -BODY.thigh, -0.02],
        joints: blend(seated, { ...seated, kneeL: [180 - top, 0, 0], ankleL: [-12, 0, 0] }, s),
      }),
    }
  },
}

/**
 * The motion for an exercise id, or null. `pose(s)` gives
 * { root: [x, y, z] metres from standing, joints: { joint: [x, y, z] degrees } }.
 */
export function motionFor(exerciseId) {
  const ex = getExercise(exerciseId)
  const make = MOTIONS[exerciseId]
  if (!ex || !make) return null
  const m = make(ex)
  const phases = PHASES.map((phase) => ({ phase, duration: m.tempo[phase] }))
  let start = 0
  for (const p of phases) {
    p.start = start
    start += p.duration
  }
  return { id: exerciseId, view: ex.view, seated: !!m.seated, peak: m.peak, pose: m.pose, phases, cycle: start }
}

/** Where `t` seconds (0 ≤ t < cycle) falls: phase, progress through it, and the blend amount s. */
export function sampleAt(motion, t) {
  const time = Math.min(Math.max(t, 0), motion.cycle)
  const p = motion.phases.find((ph) => time < ph.start + ph.duration) ?? motion.phases[motion.phases.length - 1]
  const progress = Math.min(1, (time - p.start) / p.duration)
  const s = { rest: 0, up: easeInOut(progress), hold: 1, down: 1 - easeInOut(progress) }[p.phase]
  return { phase: p.phase, progress, s }
}
