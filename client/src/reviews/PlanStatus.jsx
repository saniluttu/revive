import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { REVIEW_STATUS } from '../services/reviewService.js'
import { doctorName, planExercises, planSessionUrl } from './plan.js'

const STATUS_STYLE = {
  [REVIEW_STATUS.PENDING]: { box: 'bg-amber-50 ring-amber-200', badge: 'bg-amber-100 text-amber-900' },
  [REVIEW_STATUS.APPROVED]: { box: 'bg-brand-50 ring-brand-100', badge: 'bg-brand-600 text-white' },
  [REVIEW_STATUS.REJECTED]: { box: 'bg-red-50 ring-red-200', badge: 'bg-red-100 text-red-800' },
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/**
 * Plan exercises with their reps × sets. Locked: shown greyed with a lock and no link;
 * otherwise each one starts a Live Session with the plan's reps/sets.
 */
export function PlanExerciseList({ exercises, reviewId, locked }) {
  const { t } = useTranslation()
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {exercises.map((e) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block text-xl font-bold">{t(`exercises.${e.id}.name`)}</span>
              <span className="block text-lg text-slate-600">{t('review.repsSets', { reps: e.reps, sets: e.sets })}</span>
            </span>
            {locked ? (
              <span className="flex items-center gap-1 text-base font-semibold text-slate-500">
                <LockIcon />
                {t('review.locked')}
              </span>
            ) : (
              <span className="whitespace-nowrap text-lg font-semibold text-brand-700">{t('review.start')} →</span>
            )}
          </>
        )
        const base = 'flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1'
        return (
          <li key={e.id}>
            {locked ? (
              <div className={`${base} opacity-75 ring-slate-200`} aria-disabled>
                {body}
              </div>
            ) : (
              <Link to={planSessionUrl(reviewId, e.id)} className={`${base} ring-brand-600 transition hover:bg-brand-50`}>
                {body}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The plan's review status: pending, approved by Dr. <name> (with notes), or rejected (with reason). */
export default function PlanStatus({ review, showExercises = true }) {
  const { t } = useTranslation()
  const style = STATUS_STYLE[review.status]
  const approved = review.status === REVIEW_STATUS.APPROVED
  const rejected = review.status === REVIEW_STATUS.REJECTED
  const exercises = planExercises(approved ? review.plan : review.aiPlan)
  const dr = review.reviewer && doctorName(t, review.reviewer.name)

  return (
    <div className={`space-y-4 rounded-3xl p-5 ring-1 sm:p-6 ${style.box}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{t('review.planTitle')}</h2>
        <span className={`rounded-full px-4 py-1.5 text-lg font-bold ${style.badge}`}>
          {approved ? t('review.approvedBy', { name: dr }) : t(`review.status.${review.status}`)}
        </span>
      </div>

      {review.status === REVIEW_STATUS.PENDING && <p className="text-lg text-amber-950">{t('review.pendingText')}</p>}

      {approved && (
        <>
          {review.reviewer?.clinic && <p className="text-lg text-slate-700">{review.reviewer.clinic}</p>}
          {review.notes && (
            <blockquote className="rounded-2xl bg-white p-4 text-lg ring-1 ring-brand-100">
              <span className="block text-base font-semibold text-brand-800">{t('review.notesFrom', { name: dr })}</span>
              <span className="whitespace-pre-line">{review.notes}</span>
            </blockquote>
          )}
        </>
      )}

      {rejected && (
        <div className="space-y-3">
          <p className="text-lg text-red-900">{t('review.rejectedText', { name: dr })}</p>
          <blockquote className="whitespace-pre-line rounded-2xl bg-white p-4 text-lg ring-1 ring-red-200">
            <span className="block text-base font-semibold text-red-800">{t('review.reason')}</span>
            {review.rejectReason}
          </blockquote>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/report" className="btn-secondary flex-1">
              {t('review.uploadAnother')}
            </Link>
            <Link to="/exercises" className="btn-secondary flex-1">
              {t('review.chooseManually')}
            </Link>
          </div>
        </div>
      )}

      {showExercises && !rejected && exercises.length > 0 && (
        <PlanExerciseList exercises={exercises} reviewId={review.id} locked={!approved} />
      )}
    </div>
  )
}
