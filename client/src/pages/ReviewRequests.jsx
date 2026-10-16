import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { dayKey } from '../components/progressStats.js'
import { Empty, StatCard, StatGrid } from '../components/ui.jsx'
import { formatDate, STATUS_BADGE } from '../reviews/plan.js'
import useReviews, { useReviewsLoaded } from '../reviews/useReviews.js'
import { approveReview, listReviews, REVIEW_STATUS } from '../services/reviewService.js'

const HOUR_MS = 60 * 60 * 1000

/** "3 h" / "2 days" since the request */
function waitingFor(t, iso, now) {
  const hours = Math.max(0, Math.floor((now - new Date(iso).getTime()) / HOUR_MS))
  return hours < 24 ? t('reviews.waitingHours', { count: hours }) : t('reviews.waitingDays', { count: Math.floor(hours / 24) })
}

function Patient({ review }) {
  const { t } = useTranslation()
  const parts = review.report.affected_body_parts ?? []
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-2xl font-bold">
        {review.patient.name}
        {review.patient.age != null && <span className="ml-2 text-lg font-semibold text-slate-500">{t('reviews.age', { age: review.patient.age })}</span>}
      </div>
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parts.map((p) => (
            <span key={p} className="rounded-full bg-sky-100 px-3 py-0.5 text-base font-semibold text-sky-900">
              {t(`bodyParts.${p}.name`, { defaultValue: p })}
            </span>
          ))}
        </div>
      )}
      <div className="text-lg text-slate-700">{review.report.diagnosis}</div>
    </div>
  )
}

/** A pending request: Review opens the detail page; Approve (with a confirm step) approves the AI plan as it is. */
function PendingRow({ review, now }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await approveReview(review.id, user)
    } catch (err) {
      setError(err.code ?? 'unknown')
      setBusy(false)
    }
  }

  return (
    <li className="card space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Patient review={review} />
        <div className="shrink-0 text-left sm:text-right">
          <div className="text-lg font-bold text-amber-700">{waitingFor(t, review.createdAt, now)}</div>
          <div className="text-base text-slate-500">{t('reviews.requested', { date: formatDate(review.createdAt, i18n.language) })}</div>
        </div>
      </div>
      <div className="text-base text-slate-600">
        {t('reviews.aiPlanShort', { count: review.aiPlan.length, list: review.aiPlan.map((p) => t(`exercises.${p.exerciseId}.name`, { defaultValue: p.exerciseId })).join(', ') })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/reviews/${review.id}`} className="btn-primary">
          {t('reviews.review')}
        </Link>
        {confirming ? (
          <>
            <button type="button" className="btn bg-brand-700 text-white hover:bg-brand-800" onClick={approve} disabled={busy}>
              {busy ? t('common.pleaseWait') : t('reviews.confirmApprove')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>
              {t('reviews.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => setConfirming(true)} disabled={!review.aiPlan.length}>
            {t('reviews.quickApprove')}
          </button>
        )}
      </div>
      {error && <p className="text-lg font-semibold text-red-700">{t(`review.errors.${error}`, { defaultValue: t('errors.unknown') })}</p>}
    </li>
  )
}

function ReviewedRow({ review }) {
  const { t, i18n } = useTranslation()
  return (
    <li>
      <Link to={`/reviews/${review.id}`} className="card flex flex-col gap-3 transition hover:ring-brand-500 sm:flex-row sm:items-center sm:justify-between">
        <Patient review={review} />
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <span className={`w-fit rounded-full px-3 py-1 text-base font-semibold ${STATUS_BADGE[review.status]}`}>{t(`review.status.${review.status}`)}</span>
          <span className="text-base text-slate-500">{formatDate(review.reviewedAt, i18n.language)}</span>
        </div>
      </Link>
    </li>
  )
}

export default function ReviewRequests() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const reviews = useReviews()
  const loaded = useReviewsLoaded()
  const [tab, setTab] = useState('pending')
  const [now] = useState(() => Date.now())

  const all = listReviews(reviews)
  const pending = all.filter((r) => r.status === REVIEW_STATUS.PENDING).reverse() // oldest first: first come, first served
  const mine = all.filter((r) => r.status !== REVIEW_STATUS.PENDING && r.reviewer?.uid === user.uid)
  const approvedToday = mine.filter((r) => r.status === REVIEW_STATUS.APPROVED && dayKey(r.reviewedAt) === dayKey(now)).length
  const patients = new Set(mine.map((r) => r.patientUid ?? r.patient.uid)).size

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('reviews.title')}</h1>
        <p className="mt-1 text-xl text-slate-600">{t('reviews.subtitle')}</p>
      </div>

      <StatGrid>
        <StatCard label={t('reviews.statPending')} value={pending.length} tone={pending.length ? 'warn' : 'default'} />
        <StatCard label={t('reviews.statApprovedToday')} value={approvedToday} tone="good" />
        <StatCard label={t('reviews.statPatients')} value={patients} />
      </StatGrid>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 sm:max-w-md" role="tablist">
        {[
          ['pending', t('reviews.pending', { count: pending.length })],
          ['history', t('reviews.reviewed')],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-xl py-3 text-lg font-semibold transition ${tab === value ? 'bg-white text-brand-700 shadow' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!loaded ? (
        <Empty>{t('common.pleaseWait')}</Empty>
      ) : tab === 'pending' ? (
        pending.length ? (
          <ul className="space-y-3">
            {pending.map((r) => (
              <PendingRow key={r.id} review={r} now={now} />
            ))}
          </ul>
        ) : (
          <Empty>{t('reviews.none')}</Empty>
        )
      ) : mine.length ? (
        <ul className="space-y-3">
          {mine.map((r) => (
            <ReviewedRow key={r.id} review={r} />
          ))}
        </ul>
      ) : (
        <Empty>{t('reviews.noneReviewed')}</Empty>
      )}
    </section>
  )
}
