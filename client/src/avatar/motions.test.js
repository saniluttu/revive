import { Object3D, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { EXERCISES, getExercise } from '../exercises/library.js'
import { onAvatarStep } from './events.js'
import { kneeFlexionForDepth, motionFor, PHASE_STEP, PHASES, sampleAt } from './motions.js'
import { createPlayer } from './player.js'
import { applyPose, BODY, JOINTS, SKELETON } from './rig.js'

// A bare skeleton (no meshes) to measure posed joint positions
function skeleton() {
  const bones = {}
  for (const j of JOINTS) {
    bones[j] = new Object3D()
    bones[j].position.fromArray(SKELETON[j].offset)
  }
  for (const j of JOINTS) if (SKELETON[j].parent) bones[SKELETON[j].parent].add(bones[j])
  return bones
}

function posed(motion, s) {
  const bones = skeleton()
  applyPose(bones, motion.pose(s))
  bones.pelvis.updateWorldMatrix(false, true)
  return (j) => bones[j].getWorldPosition(new Vector3())
}

// Angle at b between a and c, in degrees — what the rep counter measures
function angleAt(a, b, c) {
  return (a.clone().sub(b).angleTo(c.clone().sub(b)) * 180) / Math.PI
}

describe('avatar motions', () => {
  it('has a motion for every library exercise', () => {
    for (const e of EXERCISES) expect(motionFor(e.id), e.id).not.toBeNull()
  })

  it('shoulder abduction reaches the ideal angle on both arms', () => {
    const ex = getExercise('shoulder-abduction')
    const at = posed(motionFor(ex.id), 1)
    expect(angleAt(at('hipL'), at('shoulderL'), at('elbowL'))).toBeCloseTo(ex.ideal, 0)
    expect(angleAt(at('hipR'), at('shoulderR'), at('elbowR'))).toBeCloseTo(ex.ideal, 0)
    // and starts below the rest threshold
    const start = posed(motionFor(ex.id), 0)
    expect(angleAt(start('hipL'), start('shoulderL'), start('elbowL'))).toBeLessThan(ex.rest)
  })

  it('shoulder flexion raises the arm forward to the ideal angle', () => {
    const ex = getExercise('shoulder-flexion')
    const at = posed(motionFor(ex.id), 1)
    expect(angleAt(at('hipL'), at('shoulderL'), at('elbowL'))).toBeCloseTo(ex.ideal, -1)
    expect(at('elbowL').z).toBeGreaterThan(at('shoulderL').z) // in front of the body
  })

  it('mini squat bends the knees to the ideal depth with the feet planted', () => {
    const ex = getExercise('mini-squat')
    const motion = motionFor(ex.id)
    const top = posed(motion, 1)
    const knee = angleAt(top('hipL'), top('kneeL'), top('ankleL'))
    const depth = (1 - Math.cos(((180 - knee) * Math.PI) / 360)) * 100 // library.js squatDepth
    expect(depth).toBeCloseTo(ex.ideal, 1)
    for (const s of [0, 0.5, 1]) {
      const ankle = posed(motion, s)('ankleL')
      expect(ankle.y, `s=${s}`).toBeCloseTo(BODY.ankleHeight, 2)
    }
  })

  it('kneeFlexionForDepth inverts the squat depth formula', () => {
    const k = kneeFlexionForDepth(9)
    expect((1 - Math.cos(((k / 2) * Math.PI) / 180)) * 100).toBeCloseTo(9, 6)
  })

  it('seated knee extension straightens from below rest to the ideal knee angle', () => {
    const ex = getExercise('seated-knee-extension')
    const motion = motionFor(ex.id)
    const start = posed(motion, 0)
    const top = posed(motion, 1)
    expect(angleAt(start('hipL'), start('kneeL'), start('ankleL'))).toBeLessThan(ex.rest)
    expect(angleAt(top('hipL'), top('kneeL'), top('ankleL'))).toBeCloseTo(ex.ideal, 0)
    expect(start('ankleL').y).toBeCloseTo(BODY.ankleHeight, 2) // feet on the floor when seated
  })

  it('samples the phases in order with eased motion', () => {
    const m = motionFor('shoulder-abduction')
    expect(m.phases.map((p) => p.phase)).toEqual(PHASES)
    expect(sampleAt(m, 0)).toMatchObject({ phase: 'rest', s: 0 })
    const up = m.phases[1]
    expect(sampleAt(m, up.start + up.duration / 2).s).toBeCloseTo(0.5)
    expect(sampleAt(m, up.start + 0.01 * up.duration).s).toBeLessThan(0.01) // eases in
    expect(sampleAt(m, m.phases[2].start + 0.1)).toMatchObject({ phase: 'hold', s: 1 })
  })
})

describe('avatar player', () => {
  it('emits a step event per phase, loops and counts reps', () => {
    const steps = []
    const bus = vi.fn()
    const off = onAvatarStep(bus)
    const p = createPlayer(motionFor('mini-squat'), { onStep: (e) => steps.push(e.phase) })
    p.play()
    for (let i = 0; i < 120 * 10; i++) p.tick(1 / 120) // 10 s
    off()
    expect(steps.slice(0, 5)).toEqual(['rest', 'up', 'hold', 'down', 'rest'])
    expect(p.state().rep).toBe(1)
    expect(bus).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: 'mini-squat', step: PHASE_STEP.up }))
  })

  it('half speed takes twice as long', () => {
    const m = motionFor('shoulder-abduction')
    const p = createPlayer(m)
    p.setSpeed(0.5)
    p.play()
    expect(p.tick(m.phases[1].start + 0.1).phase).toBe('rest')
  })

  it('stops after one rep when auto-loop is off', () => {
    const m = motionFor('shoulder-flexion')
    const p = createPlayer(m)
    p.setLoop(false)
    p.play()
    p.tick(m.cycle + 0.5)
    expect(p.state()).toMatchObject({ playing: false, rep: 0 })
  })

  it('follows an instruction step: plays the move once and stops at the top', () => {
    const m = motionFor('shoulder-abduction')
    const events = []
    const p = createPlayer(m, { onStep: (e) => events.push(e) })
    p.followStep(0)
    const end = p.tick(10)
    expect(p.state().playing).toBe(false)
    expect(end.s).toBeCloseTo(1, 3)
    expect(events.at(-1)).toMatchObject({ step: 0, source: 'follow' })
    p.followStep(1)
    expect(p.tick(1)).toMatchObject({ phase: 'hold', s: 1 })
    p.followStep(-1)
    expect(p.tick(1)).toMatchObject({ phase: 'rest', s: 0 })
  })
})
