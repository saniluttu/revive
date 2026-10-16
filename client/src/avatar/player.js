// Playback clock for an avatar motion: play/pause, speed, auto-loop, and
// playing one phase at a time (to follow the instructions being read aloud).
// Plain JS — no React or three.js — so it can be driven by any render loop.
//
// Step events: whenever the phase changes the player calls `onStep` with
//   { exerciseId, phase, step, rep, source }
// where `step` is the instruction step index (−1 setup, 0…2 steps) and
// `source` is 'loop' (normal playback) or 'follow' (driven by `followStep`).
// Events are also published on the shared bus in events.js.

import { emitAvatarStep } from './events.js'
import { PHASE_STEP, sampleAt, STEP_PHASE } from './motions.js'

export const SPEEDS = [0.5, 1]

export function createPlayer(motion, { onStep, onChange, speed: initialSpeed = 1, loop: initialLoop = true, autoplay = false } = {}) {
  let time = 0
  let playing = autoplay
  let speed = initialSpeed
  let loop = initialLoop
  let rep = 0
  let stopAt = null // end of the phase being played on its own
  let source = 'loop'
  let lastPhase = null
  const listeners = new Set()

  const state = () => ({ playing, speed, loop, rep })
  const changed = () => onChange?.(state())

  function announce(phase) {
    if (phase === lastPhase) return
    lastPhase = phase
    const event = { exerciseId: motion.id, phase, step: PHASE_STEP[phase], rep, source }
    onStep?.(event)
    for (const l of listeners) l(event)
    emitAvatarStep(event)
  }

  function phaseStart(phase) {
    return motion.phases.find((p) => p.phase === phase)
  }

  const player = {
    motion,
    state,

    /** Subscribe to this player's step events; returns an unsubscribe function. */
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Advance by `dt` real seconds; returns the current sample { phase, progress, s, pose }. */
    tick(dt) {
      if (playing) {
        time += dt * speed
        if (stopAt != null && time >= stopAt) {
          time = stopAt - 1e-6
          stopAt = null
          playing = false
          changed()
        } else if (time >= motion.cycle) {
          if (loop) {
            time %= motion.cycle
            rep += 1
          } else {
            time = 0
            playing = false
            changed()
          }
        }
      }
      const sample = sampleAt(motion, time)
      announce(sample.phase)
      return { ...sample, pose: motion.pose(sample.s) }
    },

    play() {
      source = 'loop'
      stopAt = null
      playing = true
      changed()
    },
    pause() {
      playing = false
      stopAt = null
      changed()
    },
    toggle() {
      if (playing) player.pause()
      else player.play()
    },
    setSpeed(value) {
      speed = value
      changed()
    },
    setLoop(value) {
      loop = value
      changed()
    },

    /** Jump to the start of a phase (paused). */
    seek(phase) {
      const p = phaseStart(phase)
      if (!p) return
      time = p.start
      stopAt = null
      playing = false
      changed()
    },

    /**
     * Show an instruction step: −1 holds the start pose, 1 holds the top,
     * 0 and 2 play the move up / back down once and stop at its end.
     */
    followStep(step) {
      const phase = STEP_PHASE[step]
      const p = phase && phaseStart(phase)
      if (!p) return
      source = 'follow'
      if (phase === 'rest' || phase === 'hold') {
        time = p.start + (phase === 'hold' ? p.duration / 2 : 0)
        stopAt = null
        playing = false
      } else {
        time = p.start
        stopAt = p.start + p.duration
        playing = true
      }
      changed()
    },
  }
  return player
}
