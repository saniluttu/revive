// Helpers for showing a review's exercise plan.
import { getExercise } from '../exercises/library.js'
import { REVIEW_STATUS } from '../services/reviewService.js'

export const STATUS_BADGE = {
  [REVIEW_STATUS.PENDING]: 'bg-amber-100 text-amber-900',
  [REVIEW_STATUS.APPROVED]: 'bg-primary-fixed/50 text-primary',
  [REVIEW_STATUS.REJECTED]: 'bg-red-100 text-error',
}

export function formatDate(iso, lng) {
  if (!iso) return ''
  return new Intl.DateTimeFormat(lng === 'ml' ? 'ml-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/** Plan items → library exercises with the plan's reps/sets (unknown ids dropped). */
export function planExercises(plan = []) {
  return plan
    .map((p) => {
      const exercise = getExercise(p.exerciseId)
      return exercise && { ...exercise, reps: p.reps, sets: p.sets }
    })
    .filter(Boolean)
}

// Same object for the same exercise + dose, so the Live Session's rep counter isn't reset on every render
const dosed = new Map()

/** A library exercise with the plan's reps/sets. */
export function withPlanDose(exercise, { reps, sets }) {
  const key = `${exercise.id}:${reps}:${sets}`
  if (!dosed.has(key)) dosed.set(key, { ...exercise, reps, sets })
  return dosed.get(key)
}

/** Live Session URL for one exercise of an approved plan. */
export function planSessionUrl(reviewId, exerciseId) {
  return `/session?exercise=${encodeURIComponent(exerciseId)}&plan=${encodeURIComponent(reviewId)}`
}

/** "Dr. Anitha" without doubling a "Dr." the physiotherapist typed themselves. */
export function doctorName(t, name) {
  return t('review.doctor', { name: String(name ?? '').replace(/^dr\.?\s+/i, '') })
}
