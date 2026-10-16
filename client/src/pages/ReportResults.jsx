import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { getExercise } from '../exercises/library.js'
import { planSessionUrl } from '../reviews/plan.js'
import PlanStatus from '../reviews/PlanStatus.jsx'
import useReviews from '../reviews/useReviews.js'
import { lastReportResult } from '../services/reportService.js'
import { requestReview, REVIEW_PRICE_INR, REVIEW_STATUS, reviewForReport } from '../services/reviewService.js'

const SEVERITY_STYLE = {
  mild: 'bg-brand-100 text-brand-800',
  moderate: 'bg-amber-100 text-amber-900',
  severe: 'bg-red-100 text-red-800',
  unknown: 'bg-slate-100 text-slate-700',
}

const PROVIDER_NAMES = { ollama: 'Ollama (local)', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' }

function ProviderBadge({ provider, cached }) {
  const { t } = useTranslation()
  const name = PROVIDER_NAMES[provider] ?? provider
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-white">
      {cached ? t('report.answeredByCached', { provider: name }) : t('report.answeredBy', { provider: name })}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <div className="card space-y-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </div>
  )
}

// `href` null = locked (until a physiotherapist approves the plan); `lockText` says why
function SuggestedExercise({ exercise, href, lockText }) {
  const { t } = useTranslation()
  const Tag = href ? Link : 'div'
  return (
    <Tag
      {...(href && { to: href })}
      className={`flex flex-col gap-2 rounded-3xl border-2 bg-white p-5 transition ${
        href ? 'border-brand-600 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-md' : 'border-slate-200'
      }`}
    >
      <span className="text-base font-semibold uppercase tracking-wide text-brand-700">
        {t(`bodyParts.${exercise.bodyPart}.name`)}
      </span>
      <span className="text-2xl font-bold">{t(`exercises.${exercise.id}.name`)}</span>
      <span className="text-lg text-slate-600">
        {t('session.repsSetsDifficulty', {
          reps: exercise.reps,
          sets: exercise.sets,
          difficulty: t(`difficulty.${exercise.difficulty}`),
        })}
      </span>
      {href ? (
        <span className="mt-1 text-lg font-semibold text-brand-700">{t('report.startExercise')} →</span>
      ) : (
        <span className="mt-1 text-base font-semibold text-slate-500">{t(lockText)}</span>
      )}
    </Tag>
  )
}

// "Request physiotherapist review — ₹199 (demo)" → a clearly labelled demo confirmation → pending request
function RequestReview({ onConfirm }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err.code ?? 'unknown')
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <div className="card space-y-3">
        <h2 className="text-2xl font-bold">{t('review.requestTitle')}</h2>
        <p className="text-lg text-slate-700">{t('review.requestText')}</p>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setConfirming(true)}>
          {t('review.requestButton', { price: REVIEW_PRICE_INR })}
        </button>
      </div>
    )
  }
  return (
    <div className="card space-y-4 ring-2 ring-brand-600" role="group" aria-labelledby="confirm-review">
      <h2 id="confirm-review" className="text-2xl font-bold">
        {t('review.confirmTitle')}
      </h2>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-xl ring-1 ring-slate-200">
        <span>{t('review.confirmItem')}</span>
        <span className="font-bold tabular-nums">₹{REVIEW_PRICE_INR}</span>
      </div>
      <p className="rounded-2xl bg-amber-50 p-4 text-lg font-semibold text-amber-900 ring-1 ring-amber-200">
        {t('review.demoNotice')}
      </p>
      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-700">
          {t(`review.errors.${error}`, { defaultValue: t('errors.unknown') })}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn-primary flex-1" onClick={confirm} disabled={busy}>
          {busy ? t('common.pleaseWait') : t('review.confirmButton')}
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={() => setConfirming(false)} disabled={busy}>
          {t('review.cancel')}
        </button>
      </div>
    </div>
  )
}

export default function ReportResults() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const reviews = useReviews()
  const location = useLocation()
  const result = location.state?.analysis ? location.state : lastReportResult(user.uid)
  if (!result?.analysis) return <Navigate to="/report" replace />

  const { analysis: a, provider, cached } = result
  const ml = i18n.language === 'ml'
  const pick = (v) => (v ? (ml ? v.ml : v.en) || v.en || v.ml : '')
  const exercises = a.recommended_exercise_ids.map(getExercise).filter(Boolean)

  // Exercises from the AI plan unlock only once a physiotherapist approves it
  const reportId = result.id ?? result.fileName
  const review = reviewForReport(user.uid, reportId, reviews)
  const approved = review?.status === REVIEW_STATUS.APPROVED
  const planItem = (id) => (approved ? review.plan.find((p) => p.exerciseId === id) : null)
  const inPlan = (id) => Boolean(planItem(id))
  const lockText = approved
    ? 'review.notInPlan'
    : review?.status === REVIEW_STATUS.REJECTED
      ? 'review.notApproved'
      : 'review.lockedLong'
  const askForReview = () =>
    requestReview({
      user,
      reportId,
      report: { ...a, fileName: result.fileName },
      aiPlan: exercises.map((e) => ({ exerciseId: e.id, reps: e.reps, sets: e.sets })),
    })

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{t('report.resultsTitle')}</h1>
          {result.fileName && <p className="mt-1 break-all text-lg text-slate-500">{result.fileName}</p>}
        </div>
        <ProviderBadge provider={provider} cached={cached} />
      </div>

      <p role="note" className="rounded-2xl bg-amber-50 p-4 text-lg font-semibold text-amber-900 ring-1 ring-amber-200">
        {t('report.disclaimer')}
      </p>

      <Section title={t('report.findings')}>
        <p className="text-xl leading-relaxed">{ml ? a.summary_ml : a.summary_en}</p>
        <div className="flex flex-wrap items-center gap-3 text-lg text-slate-700">
          <span>
            <strong>{t('report.diagnosis')}:</strong> {a.diagnosis}
          </span>
          <span className={`rounded-full px-3 py-1 text-base font-semibold ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.unknown}`}>
            {t(`report.severity.${a.severity}`, { defaultValue: t('report.severity.unknown') })}
          </span>
        </div>
      </Section>

      {a.affected_body_parts.length > 0 && (
        <Section title={t('report.focusOn')}>
          <div className="flex flex-wrap gap-2">
            {a.affected_body_parts.map((p) => (
              <span key={p} className="rounded-full bg-brand-100 px-4 py-2 text-lg font-semibold text-brand-800">
                {t(`bodyParts.${p}.name`)}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('report.suggested')}>
        {exercises.length ? (
          <>
            {pick(a.reason) && <p className="text-lg text-slate-700">{pick(a.reason)}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {exercises.map((e) => (
                <SuggestedExercise
                  key={e.id}
                  exercise={inPlan(e.id) ? { ...e, reps: planItem(e.id).reps, sets: planItem(e.id).sets } : e}
                  href={inPlan(e.id) ? planSessionUrl(review.id, e.id) : null}
                  lockText={lockText}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-lg text-slate-600">{t('report.noSuggestions')}</p>
        )}
      </Section>

      {review ? <PlanStatus review={review} showExercises={approved} /> : <RequestReview onConfirm={askForReview} />}

      {(a.avoid.length > 0 || a.restrictions.length > 0) && (
        <Section title={t('report.avoid')}>
          <ul className="space-y-2 text-lg">
            {[...a.avoid, ...a.restrictions].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="font-bold text-red-600">
                  ✕
                </span>
                <span>{pick(item)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to="/exercises" className="btn-secondary flex-1">
          {t('report.chooseManually')}
        </Link>
        <Link to="/report" className="btn-secondary flex-1">
          {t('report.uploadAnother')}
        </Link>
      </div>
    </section>
  )
}
