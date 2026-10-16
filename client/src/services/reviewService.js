// Physiotherapist review of an AI-suggested plan: the only module pages use for
// review requests.
//
// Like authService, this implementation keeps everything in localStorage so the
// app works without a backend (patient and physiotherapist must use the same
// browser for now). To move to Firestore, re-implement these exports with the
// same signatures and shapes: one `reviews/{id}` doc per request, `onSnapshot`
// behind onReviewsChanged.

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
 *   patient: { uid: string, name: string, age: number | null },
 *   report: { fileName: string, diagnosis: string, severity: string, summary_en: string, summary_ml: string,
 *             affected_body_parts: string[], avoid: {en:string, ml:string}[], restrictions: {en:string, ml:string}[] },
 *   aiPlan: PlanItem[], plan: PlanItem[] | null, notes: string, rejectReason: string,
 *   payment: { amount: number, currency: 'INR', demo: true },
 *   reviewer: Reviewer | null, createdAt: string, reviewedAt: string | null,
 * }} Review
 */

const REVIEWS_KEY = 'revive.reviews' // { [id]: Review }

/** Errors carry a `code`; the UI shows i18n `review.errors.<code>`. */
function reviewError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(REVIEWS_KEY)) ?? {}
  } catch {
    return {}
  }
}

const listeners = new Set()
let state = { reviews: readAll() }

function setReviews(reviews) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews))
  state = { reviews }
  listeners.forEach((cb) => cb(state))
}

// Keep other tabs in sync (a request made in one tab shows up in the other)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== REVIEWS_KEY) return
    state = { reviews: readAll() }
    listeners.forEach((cb) => cb(state))
  })
}

function newId() {
  return crypto.randomUUID?.() ?? `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
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
  const existing = reviewForReport(user.uid, reportId)
  if (existing && existing.status !== REVIEW_STATUS.REJECTED) return existing

  const review = {
    id: newId(),
    reportId,
    status: REVIEW_STATUS.PENDING,
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
  setReviews({ ...readAll(), [review.id]: review })
  return review
}

function reviewerFrom(user) {
  const p = user?.profile ?? {}
  return { uid: user.uid, name: p.name ?? '', registrationNumber: p.registrationNumber ?? '', clinic: p.clinic ?? '' }
}

function finish(id, physio, patch) {
  const reviews = readAll()
  const review = reviews[id]
  if (!review) throw reviewError('notFound')
  if (review.status !== REVIEW_STATUS.PENDING) throw reviewError('alreadyReviewed')
  const next = { ...review, ...patch, reviewer: reviewerFrom(physio), reviewedAt: new Date().toISOString() }
  setReviews({ ...reviews, [id]: next })
  return next
}

/**
 * Approve, optionally with an edited plan and notes for the patient.
 * @param {string} id
 * @param {object} physio the logged-in physiotherapist (User)
 * @param {{ plan?: PlanItem[], notes?: string }} [changes] plan defaults to the AI plan
 */
export async function approveReview(id, physio, { plan, notes = '' } = {}) {
  const review = readAll()[id]
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
export function reviewForReport(patientUid, reportId, reviews = readAll()) {
  return listReviews(reviews).find((r) => r.patient.uid === patientUid && r.reportId === reportId) ?? null
}

/**
 * Same object until something changes (for useSyncExternalStore).
 * @returns {{ reviews: Record<string, Review> }}
 */
export function getReviewsState() {
  return state
}

/** @returns {() => void} unsubscribe */
export function onReviewsChanged(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
