import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { formatDate, STATUS_BADGE } from '../reviews/plan.js'
import useReviews, { useReviewsLoaded } from '../reviews/useReviews.js'
import { listReviews, REVIEW_STATUS } from '../services/reviewService.js'

function RequestRow({ review }) {
  const { t, i18n } = useTranslation()
  return (
    <li>
      <Link
        to={`/reviews/${review.id}`}
        className="card flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-500 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <div className="text-2xl font-bold">
            {review.patient.name}
            {review.patient.age != null && (
              <span className="ml-2 text-lg font-semibold text-slate-500">{t('reviews.age', { age: review.patient.age })}</span>
            )}
          </div>
          <div className="text-lg text-slate-700">{review.report.diagnosis}</div>
          <div className="text-base text-slate-500">
            {t('reviews.requested', { date: formatDate(review.createdAt, i18n.language) })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-base font-semibold ${STATUS_BADGE[review.status]}`}>
            {t(`review.status.${review.status}`)}
          </span>
          <span className="text-lg font-semibold text-brand-700">{t('reviews.open')} →</span>
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
  const pending = listReviews(reviews, { status: REVIEW_STATUS.PENDING }).reverse() // oldest first: first come, first served
  const mine = listReviews(reviews).filter((r) => r.status !== REVIEW_STATUS.PENDING && r.reviewer?.uid === user.uid)

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('reviews.title')}</h1>
        <p className="mt-1 text-xl text-slate-600">{t('reviews.subtitle')}</p>
      </div>

      {!loaded && <p className="card text-lg text-slate-500">{t('common.pleaseWait')}</p>}

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('reviews.pending', { count: pending.length })}</h2>
        {pending.length ? (
          <ul className="space-y-3">
            {pending.map((r) => (
              <RequestRow key={r.id} review={r} />
            ))}
          </ul>
        ) : (
          <p className="card text-lg text-slate-500">{t('reviews.none')}</p>
        )}
      </div>

      {mine.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{t('reviews.reviewed')}</h2>
          <ul className="space-y-3">
            {mine.map((r) => (
              <RequestRow key={r.id} review={r} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
