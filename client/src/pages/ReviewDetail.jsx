import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import ExerciseImages from '../components/ExerciseImages.jsx'
import { EXERCISES } from '../exercises/library.js'
import { doctorName, formatDate, planExercises, STATUS_BADGE } from '../reviews/plan.js'
import useReviews, { useReviewsLoaded } from '../reviews/useReviews.js'
import { approveReview, getReview, rejectReview, REVIEW_STATUS } from '../services/reviewService.js'

function Section({ title, children }) {
  return (
    <div className="card space-y-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </div>
  )
}

function PlanTable({ exercises }) {
  const { t } = useTranslation()
  if (!exercises.length) return <p className="text-lg text-slate-500">{t('reviews.noExercises')}</p>
  return (
    <ul className="divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200">
      {exercises.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-lg">
          <span className="flex flex-wrap items-center gap-3">
            <ExerciseImages id={e.id} size="sm" />
            <span className="font-semibold">{t(`exercises.${e.id}.name`)}</span>
          </span>
          <span className="text-slate-600">{t('review.repsSets', { reps: e.reps, sets: e.sets })}</span>
        </li>
      ))}
    </ul>
  )
}

function NumberField({ label, value, min, max, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className="input w-24"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  )
}

// Editable plan: change exercises, reps and sets; add or remove rows
function PlanEditor({ plan, onChange }) {
  const { t } = useTranslation()
  const used = new Set(plan.map((p) => p.exerciseId))
  const unused = EXERCISES.filter((e) => !used.has(e.id))
  const update = (i, patch) => onChange(plan.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <div className="space-y-3">
      {plan.map((p, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <ExerciseImages id={p.exerciseId} size="sm" />
          <label className="block min-w-0 flex-1 basis-56">
            <span className="mb-1 block text-base font-semibold text-slate-600">{t('reviews.exercise')}</span>
            <select
              className="input"
              value={p.exerciseId}
              onChange={(e) => {
                const ex = EXERCISES.find((x) => x.id === e.target.value)
                update(i, { exerciseId: ex.id, reps: ex.reps, sets: ex.sets })
              }}
            >
              {EXERCISES.filter((e) => e.id === p.exerciseId || !used.has(e.id)).map((e) => (
                <option key={e.id} value={e.id}>
                  {t(`exercises.${e.id}.name`)}
                </option>
              ))}
            </select>
          </label>
          <NumberField label={t('reviews.reps')} value={p.reps} min={1} max={50} onChange={(reps) => update(i, { reps })} />
          <NumberField label={t('reviews.sets')} value={p.sets} min={1} max={10} onChange={(sets) => update(i, { sets })} />
          <button
            type="button"
            className="rounded-xl px-3 py-3 text-lg font-semibold text-red-700 hover:bg-red-50"
            onClick={() => onChange(plan.filter((_, j) => j !== i))}
          >
            {t('reviews.remove')}
          </button>
        </div>
      ))}
      {unused.length > 0 && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange([...plan, { exerciseId: unused[0].id, reps: unused[0].reps, sets: unused[0].sets }])}
        >
          {t('reviews.addExercise')}
        </button>
      )}
    </div>
  )
}

function Outcome({ review }) {
  const { t, i18n } = useTranslation()
  const approved = review.status === REVIEW_STATUS.APPROVED
  return (
    <Section title={t('reviews.outcome')}>
      <p className="text-lg text-slate-700">
        {t('reviews.reviewedBy', {
          name: doctorName(t, review.reviewer?.name),
          date: formatDate(review.reviewedAt, i18n.language),
        })}
      </p>
      {approved ? (
        <>
          <PlanTable exercises={planExercises(review.plan)} />
          {review.notes && <p className="whitespace-pre-line rounded-2xl bg-brand-50 p-4 text-lg">{review.notes}</p>}
        </>
      ) : (
        <p className="whitespace-pre-line rounded-2xl bg-red-50 p-4 text-lg text-red-900">
          <strong>{t('review.reason')}:</strong> {review.rejectReason}
        </p>
      )}
    </Section>
  )
}

// Waits for the reviews to load from Firestore (e.g. after a refresh) before deciding the request is gone
export default function ReviewDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const review = getReview(id, useReviews())
  const loaded = useReviewsLoaded()
  if (!loaded) return <p className="card text-lg text-slate-500">{t('common.pleaseWait')}</p>
  if (!review) return <Navigate to="/reviews" replace />
  return <ReviewEditor key={review.id} review={review} />
}

function ReviewEditor({ review }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()

  const [mode, setMode] = useState('view') // view | edit | reject
  const [plan, setPlan] = useState(() => review?.aiPlan ?? [])
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const ml = i18n.language === 'ml'
  const pick = (v) => (v ? (ml ? v.ml : v.en) || v.en || v.ml : '')
  const r = review.report
  const pending = review.status === REVIEW_STATUS.PENDING
  const cautions = [...r.avoid, ...r.restrictions]

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('view')
    } catch (err) {
      setError(err.code ?? 'unknown')
    } finally {
      setBusy(false)
    }
  }
  const approve = (edited) => run(() => approveReview(review.id, user, { plan: edited ? plan : undefined, notes }))
  const reject = (e) => {
    e.preventDefault()
    run(() => rejectReview(review.id, user, reason))
  }

  return (
    <section className="space-y-6">
      <Link to="/reviews" className="inline-block text-lg font-semibold text-brand-700 underline">
        ← {t('reviews.back')}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{review.patient.name}</h1>
          <p className="mt-1 text-xl text-slate-600">
            {review.patient.age != null && `${t('reviews.age', { age: review.patient.age })} · `}
            {t('reviews.requested', { date: formatDate(review.createdAt, i18n.language) })}
          </p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-lg font-bold ${STATUS_BADGE[review.status]}`}>
          {t(`review.status.${review.status}`)}
        </span>
      </div>

      <Section title={t('reviews.reportSummary')}>
        {r.fileName && <p className="break-all text-base text-slate-500">{r.fileName}</p>}
        <p className="text-lg">
          <strong>{t('report.diagnosis')}:</strong> {r.diagnosis}{' '}
          <span className="ml-1 whitespace-nowrap rounded-full bg-slate-100 px-3 py-0.5 text-base font-semibold">
            {t(`report.severity.${r.severity}`, { defaultValue: t('report.severity.unknown') })}
          </span>
        </p>
        <p className="text-xl leading-relaxed">{ml ? r.summary_ml : r.summary_en}</p>
        {r.affected_body_parts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {r.affected_body_parts.map((p) => (
              <span key={p} className="rounded-full bg-brand-100 px-3 py-1 text-base font-semibold text-brand-800">
                {t(`bodyParts.${p}.name`)}
              </span>
            ))}
          </div>
        )}
        {cautions.length > 0 && (
          <ul className="space-y-1 text-lg">
            {cautions.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="font-bold text-red-600">
                  ✕
                </span>
                <span>{pick(c)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={mode === 'edit' ? t('reviews.editPlan') : t('reviews.aiPlan')}>
        {mode === 'edit' ? <PlanEditor plan={plan} onChange={setPlan} /> : <PlanTable exercises={planExercises(review.aiPlan)} />}
      </Section>

      {!pending && <Outcome review={review} />}

      {pending && mode !== 'reject' && (
        <div className="card space-y-4">
          <label className="block">
            <span className="mb-1 block text-lg font-semibold">{t('reviews.notes')}</span>
            <textarea
              className="input min-h-28"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('reviews.notesPlaceholder')}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-700">
              {t(`review.errors.${error}`, { defaultValue: t('errors.unknown') })}
            </p>
          )}
          {mode === 'edit' ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={() => approve(true)} disabled={busy || !plan.length}>
                {t('reviews.saveApprove')}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  setPlan(review.aiPlan)
                  setMode('view')
                  setError(null)
                }}
                disabled={busy}
              >
                {t('reviews.cancelEdit')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={() => approve(false)} disabled={busy}>
                {t('reviews.approve')}
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => setMode('edit')} disabled={busy}>
                {t('reviews.edit')}
              </button>
              <button
                type="button"
                className="btn flex-1 border-2 border-red-600 bg-white text-red-700 hover:bg-red-50"
                onClick={() => {
                  setMode('reject')
                  setError(null)
                }}
                disabled={busy}
              >
                {t('reviews.reject')}
              </button>
            </div>
          )}
        </div>
      )}

      {pending && mode === 'reject' && (
        <form onSubmit={reject} className="card space-y-4 ring-2 ring-red-300">
          <label className="block">
            <span className="mb-1 block text-lg font-semibold">{t('reviews.rejectReason')}</span>
            <textarea
              className="input min-h-28"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reviews.rejectPlaceholder')}
              required
            />
          </label>
          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-700">
              {t(`review.errors.${error}`, { defaultValue: t('errors.unknown') })}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" className="btn flex-1 bg-red-600 text-white hover:bg-red-700" disabled={busy || !reason.trim()}>
              {t('reviews.confirmReject')}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setMode('view')} disabled={busy}>
              {t('review.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
