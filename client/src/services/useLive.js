import { useEffect, useRef, useState } from 'react'
import { watchLinks, watchPlan } from './linkService.js'
import { watchSessions } from './sessionService.js'

/**
 * Live Firestore data. `watch(onChange, onError)` returns an unsubscribe; it is
 * (re)started whenever `key` changes, and skipped while `key` is null.
 * @returns {{ data: any, loading: boolean, error: Error | null }}
 */
export function useLive(key, watch) {
  const [state, setState] = useState({ key: null, data: null, error: null })
  const watchRef = useRef(watch)
  useEffect(() => {
    watchRef.current = watch
  })
  useEffect(() => {
    if (!key) return undefined
    return watchRef.current(
      (data) => setState({ key, data, error: null }),
      (error) => {
        console.warn('[live]', key, error?.code ?? error)
        setState({ key, data: null, error })
      },
    )
  }, [key])
  // Data for an older key is never shown for the new one
  const current = state.key === key
  return { data: current ? state.data : null, loading: Boolean(key) && !current, error: current ? state.error : null }
}

/** A patient's sessions, newest first. */
export const useSessions = (patientUid) =>
  useLive(patientUid && `sessions:${patientUid}`, (next, fail) => watchSessions(patientUid, next, fail))

/** Accepted links of a caregiver (`as: 'caregiver'`) or a patient (`as: 'patient'`). */
export const useLinks = (uid, as) => useLive(uid && `links:${as}:${uid}`, (next, fail) => watchLinks(uid, as, next, fail))

/** A patient's approved plan (plans/{patientUid}), or null. */
export const usePlan = (patientUid) =>
  useLive(patientUid && `plan:${patientUid}`, (next, fail) => watchPlan(patientUid, next, fail))
