// Exercise session summaries (F8), on Firestore:
//   sessions/{id} { patientUid, exercise, reps, sets, targetReps, quality, notCounted,
//                   wrongMoves: { [ruleId]: count }, painBefore, painAfter, duration (s), date }
// The patient writes their own; a linked caregiver reads them live (see firestore.rules).

import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

/**
 * Session summary from the rep counter's final snapshot (pure, for tests).
 * @param exercise library exercise (with the plan's reps/sets)
 * @param snap     repCounter snapshot when status is 'done'
 */
export function sessionSummary({ patientUid, exercise, snap, startedAt, endedAt = Date.now(), painBefore = null, painAfter = null }) {
  const counted = snap.history.filter((r) => r.counted)
  const wrongMoves = {}
  for (const r of snap.history) for (const f of r.faults) wrongMoves[f] = (wrongMoves[f] ?? 0) + 1
  return {
    patientUid,
    exercise: exercise.id,
    reps: counted.length,
    sets: snap.sets,
    targetReps: exercise.reps,
    quality: counted.length ? Math.round(counted.reduce((s, r) => s + r.quality, 0) / counted.length) : 0,
    notCounted: snap.history.length - counted.length,
    wrongMoves,
    painBefore,
    painAfter,
    duration: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    date: new Date(endedAt).toISOString(),
  }
}

/** @returns {Promise<string>} the new session's id */
export async function saveSession(summary) {
  const ref = await addDoc(collection(db, 'sessions'), summary)
  return ref.id
}

/**
 * Live list of a patient's sessions, newest first.
 * @returns {() => void} unsubscribe
 */
export function watchSessions(patientUid, onChange, onError = () => {}) {
  return onSnapshot(
    query(collection(db, 'sessions'), where('patientUid', '==', patientUid)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date))),
    onError,
  )
}
