import { useSyncExternalStore } from 'react'
import { getExercise } from '../exercises/library.js'
import { getReview, getReviewsState, onReviewsChanged, REVIEW_STATUS } from '../services/reviewService.js'
import { withPlanDose } from './plan.js'

/** Live map of review requests `{ [id]: Review }`. Re-renders when any request changes. */
export default function useReviews() {
  return useSyncExternalStore(onReviewsChanged, getReviewsState, getReviewsState).reviews
}

/**
 * The Live Session's exercise. `?exercise=<id>&plan=<review id>` is an exercise from the AI
 * plan with the physiotherapist's reps/sets, and only runs once the plan is approved (until
 * then `planLocked`). Without a plan it's a manually chosen library exercise.
 * @returns {{ exercise: object | null, planLocked: boolean, planReviewer: object | null }}
 */
export function useSessionExercise(exerciseId, planId) {
  const reviews = useReviews()
  const libraryExercise = getExercise(exerciseId)
  if (!planId) return { exercise: libraryExercise, planLocked: false, planReviewer: null }
  const review = getReview(planId, reviews)
  const item =
    review?.status === REVIEW_STATUS.APPROVED ? review.plan.find((p) => p.exerciseId === libraryExercise?.id) : null
  return {
    exercise: item ? withPlanDose(libraryExercise, item) : null,
    planLocked: Boolean(libraryExercise && !item),
    planReviewer: item ? review.reviewer : null,
  }
}
