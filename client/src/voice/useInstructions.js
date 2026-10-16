import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { pauseInstructions, playInstructions, resumeInstructions, stopInstructions } from './cuePlayer.js'

// ---------- "Read instructions aloud" setting: on by default, remembered on this device ----------

const READ_ALOUD_KEY = 'revive.readInstructions'
const listeners = new Set()

function readAloudSetting() {
  try {
    return localStorage.getItem(READ_ALOUD_KEY) !== 'off'
  } catch {
    return true
  }
}
let readAloud = readAloudSetting()

export function setReadAloud(on) {
  readAloud = on
  try {
    localStorage.setItem(READ_ALOUD_KEY, on ? 'on' : 'off')
  } catch {
    // storage blocked: the choice still applies for this visit
  }
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** @returns {[boolean, (on: boolean) => void]} */
export function useReadAloud() {
  return [useSyncExternalStore(subscribe, () => readAloud), setReadAloud]
}

// ---------- step-by-step playback ----------

/**
 * Reads an exercise's instructions aloud in the UI language.
 * `step` is what's being read: -1 the intro, 0… an index into the exercise's
 * steps, null when nothing is playing — for highlighting (and the 3D avatar).
 * Only one exercise's instructions play at a time; starting another stops this one.
 */
export default function useInstructions(exerciseId) {
  const { i18n } = useTranslation()
  const [state, setState] = useState('idle') // idle | playing | paused
  const [step, setStep] = useState(null)
  const ownRef = useRef(false) // this hook started what's playing now

  const play = useCallback(() => {
    if (!exerciseId) return
    ownRef.current = true
    setState('playing')
    playInstructions(exerciseId, i18n.language, {
      onStep: setStep,
      onEnd: () => {
        ownRef.current = false
        setState('idle')
        setStep(null)
      },
    })
  }, [exerciseId, i18n.language])

  const pause = useCallback(() => {
    pauseInstructions()
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    resumeInstructions()
    setState('playing')
  }, [])

  const stop = useCallback(() => {
    if (ownRef.current) stopInstructions()
  }, [])

  // Another exercise, another language, or leaving the page: stop reading
  useEffect(() => stop, [exerciseId, i18n.language, stop])

  return { state, step, play, pause, resume, stop }
}
