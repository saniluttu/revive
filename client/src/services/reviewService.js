// Physiotherapist review of an AI-suggested plan: the only module pages use for
// review requests.
//
// Firestore `reviews/{id}`, kept live with onSnapshot for whoever is logged in:
// a patient sees their own requests, a physiotherapist sees all of them. Reads
// are synchronous over that live state (for render); writes are async.
// Approving also writes the patient's `plans/{patientUid}` in the same batch, so
// a caregiver can see the approved plan.

import { collection, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { getAuthState, onAuthStateChanged, ROLES } from './authService.js'

export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export const REVIEW_PRICE_INR = 199 // demo only — no payment is taken

/**
 * @typedef {{ exerciseId: string, reps: number, sets: number }} PlanItem
 * @typedef {{ uid: string, name: string, registrationNumber: string, clinic: string }} Reviewer
 * @typedef {{
 *   id: string, reportId: string, status: 'pending'|'approved'|'rejected',
 *   patientUid: string, patient: { uid: string, name: string, age: number | null },
 *   report: { fileName: string, diagnosis: string, severity: string, summary_en: string, summary_ml: string,
 *             affected_body_parts: string[], avoid: {en:string, ml:string}[], restrictions: {en:string, ml:string}[] },
 *   aiPlan: PlanItem[], plan: PlanItem[] | null, notes: string, rejectReason: string,
 *   payment: { amount: number, currency: 'INR', demo: true },
 *   reviewer: Reviewer | null, createdAt: string, reviewedAt: string | null,
 * }} Review
 */

/** Errors carry a `code`; the UI shows i18n `review.errors.<code>`. */
function reviewError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

const listeners = new Set()
// `loaded`: the first snapshot for the current user has arrived (until then `reviews` is empty
// only because nothing has been read yet)
let state = { reviews: {}, loaded: false }
let loadedWaiters = []

function setReviews(reviews, loaded = true) {
  state = { reviews, loaded }
  listeners.forEach((cb) => cb(state))
  if (loaded) {
    loadedWaiters.forEach((resolve) => resolve())
    loadedWaiters = []
  }
}

/** Resolves once the current user's reviews have been read. */
function whenLoaded() {
  return state.loaded ? Promise.resolve() : new Promise((resolve) => loadedWaiters.push(resolve))
}

// ---------- live sync with Firestore, following the logged-in user ----------

let watching = null // `${uid}:${role}`
let stopWatching = null

function watchFor(user) {
  const key = user ? `${user.uid}:${user.role}` : null
  if (key === watching) return
  watching = key
  stopWatching?.()
  stopWatching = null
  setReviews({}, false)
  if (!user || !db) return setReviews({})
  const reviews = collection(db, 'reviews')
  let source
  if (user.role === ROLES.PATIENT) source = query(reviews, where('patientUid', '==', user.uid))
  else if (user.role === ROLES.PHYSIO) source = reviews
  else return setReviews({}) // caregivers see the approved plan via plans/{patientUid}
  stopWatching = onSnapshot(
    source,
    (snap) => setReviews(Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]))),
    (err) => {
      console.warn('[reviews] live updates stopped', err.code)
      setReviews(state.reviews)
    },
  )
}

watchFor(getAuthState().user)
onAuthStateChanged(({ user }) => watchFor(user))

const OUR_ERRORS = ['notLoggedIn', 'notFound', 'alreadyReviewed', 'emptyPlan', 'reasonRequired']

function toReviewError(err) {
  if (OUR_ERRORS.includes(err?.code)) return err
  console.warn('[reviews]', err?.code, err?.message)
  return reviewError(err?.code === 'permission-denied' ? 'alreadyReviewed' : 'unknown')
}

const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt)

function cleanPlan(plan) {
  if (!Array.isArray(plan)) return []
  return plan
    .filter((p) => p && typeof p.exerciseId === 'string' && p.exerciseId)
    .map((p) => ({
      exerciseId: p.exerciseId,
      reps: Math.min(50, Math.max(1, Math.round(Number(p.reps)) || 1)),
      sets: Math.min(10, Math.max(1, Math.round(Number(p.sets)) || 1)),
    }))
}

/**
 * Patient asks a physiotherapist to review the AI plan for one report.
 * Reuses an open (pending/approved) request for the same report instead of making a second one.
 * @param {{ user: object, reportId: string, report: object, aiPlan: PlanItem[] }} input
 * @returns {Promise<Review>}
 */
export async function requestReview({ user, reportId, report, aiPlan }) {
  if (!user) throw reviewError('notLoggedIn')
  await whenLoaded() // otherwise an existing request could be missed and made twice
  const existing = reviewForReport(user.uid, reportId)
  if (existing && existing.status !== REVIEW_STATUS.REJECTED) return existing

  const ref = doc(collection(db, 'reviews'))
  const review = {
    id: ref.id,
    reportId,
    status: REVIEW_STATUS.PENDING,
    patientUid: user.uid,
    patient: { uid: user.uid, name: user.profile?.name ?? user.email, age: user.profile?.age ?? null },
    report: {
      fileName: report.fileName ?? '',
      diagnosis: report.diagnosis ?? '',
      severity: report.severity ?? 'unknown',
      summary_en: report.summary_en ?? '',
      summary_ml: report.summary_ml ?? '',
      affected_body_parts: report.affected_body_parts ?? [],
      avoid: report.avoid ?? [],
      restrictions: report.restrictions ?? [],
    },
    aiPlan: cleanPlan(aiPlan),
    plan: null,
    notes: '',
    rejectReason: '',
    payment: { amount: REVIEW_PRICE_INR, currency: 'INR', demo: true },
    reviewer: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  }
  const { id: _id, ...data } = review
  const batch = writeBatch(db)
  batch.set(ref, data)
  // Lets the physiotherapist read the full report (rules: reviewRequested == true)
  batch.set(doc(db, 'reports', reportId), { patientUid: user.uid, reviewRequested: true }, { merge: true })
  try {
    await batch.commit()
  } catch (err) {
    throw toReviewError(err)
  }
  return review
}

function reviewerFrom(user) {
  const p = user?.profile ?? {}
  return { uid: user.uid, name: p.name ?? '', registrationNumber: p.registrationNumber ?? '', clinic: p.clinic ?? '' }
}

async function finish(id, physio, patch) {
  const review = state.reviews[id]
  if (!review) throw reviewError('notFound')
  if (review.status !== REVIEW_STATUS.PENDING) throw reviewError('alreadyReviewed')
  const change = { ...patch, reviewer: reviewerFrom(physio), reviewedAt: new Date().toISOString() }
  const batch = writeBatch(db)
  batch.update(doc(db, 'reviews', id), change)
  if (change.status === REVIEW_STATUS.APPROVED) {
    batch.set(doc(db, 'plans', review.patientUid), {
      patientUid: review.patientUid,
      reviewId: id,
      exercises: change.plan,
      notes: change.notes,
      reviewer: change.reviewer,
      updatedAt: change.reviewedAt,
    })
  }
  try {
    await batch.commit()
  } catch (err) {
    throw toReviewError(err)
  }
  return { ...review, ...change }
}

/**
 * Approve, optionally with an edited plan and notes for the patient.
 * @param {string} id
 * @param {object} physio the logged-in physiotherapist (User)
 * @param {{ plan?: PlanItem[], notes?: string }} [changes] plan defaults to the AI plan
 */
export async function approveReview(id, physio, { plan, notes = '' } = {}) {
  const review = state.reviews[id]
  const finalPlan = cleanPlan(plan ?? review?.aiPlan)
  if (review && !finalPlan.length) throw reviewError('emptyPlan')
  return finish(id, physio, { status: REVIEW_STATUS.APPROVED, plan: finalPlan, notes: String(notes).trim() })
}

/** Reject with a reason the patient sees. */
export async function rejectReview(id, physio, reason) {
  const text = String(reason ?? '').trim()
  if (!text) throw reviewError('reasonRequired')
  return finish(id, physio, { status: REVIEW_STATUS.REJECTED, rejectReason: text })
}

// ---------- reads (synchronous over the current state, for use in render) ----------

/** @returns {Review[]} newest first, optionally filtered by status */
export function listReviews(reviews = state.reviews, { status } = {}) {
  return Object.values(reviews)
    .filter((r) => !status || r.status === status)
    .sort(byNewest)
}

/** @returns {Review | null} */
export function getReview(id, reviews = state.reviews) {
  return reviews[id] ?? null
}

/** The patient's most recent request, which sets the plan status on Home. */
export function latestReviewFor(patientUid, reviews = state.reviews) {
  return listReviews(reviews).find((r) => r.patient.uid === patientUid) ?? null
}

/** The patient's most recent request for one report. */
export function reviewForReport(patientUid, reportId, reviews = state.reviews) {
  return listReviews(reviews).find((r) => r.patient.uid === patientUid && r.reportId === reportId) ?? null
}

/**
 * Same object until something changes (for useSyncExternalStore).
 * @returns {{ reviews: Record<string, Review>, loaded: boolean }}
 */
export function getReviewsState() {
  return state
}

/** @returns {() => void} unsubscribe */
export function onReviewsChanged(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
