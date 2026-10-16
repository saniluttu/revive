import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { getExercise } from '../exercises/library.js'
import { lastReportResult } from '../services/reportService.js'

const SEVERITY_STYLE = {
  mild: 'bg-brand-100 text-brand-800',
  moderate: 'bg-amber-100 text-amber-900',
  severe: 'bg-red-100 text-red-800',
  unknown: 'bg-slate-100 text-slate-700',
}

const PROVIDER_NAMES = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' }

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

function SuggestedExercise({ exercise }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/session?exercise=${exercise.id}`}
      className="flex flex-col gap-2 rounded-3xl border-2 border-brand-600 bg-white p-5 transition hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-md"
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
      <span className="mt-1 text-lg font-semibold text-brand-700">{t('report.startExercise')} →</span>
    </Link>
  )
}

export default function ReportResults() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const result = location.state?.analysis ? location.state : lastReportResult()
  if (!result?.analysis) return <Navigate to="/report" replace />

  const { analysis: a, provider, cached } = result
  const ml = i18n.language === 'ml'
  const pick = (v) => (v ? (ml ? v.ml : v.en) || v.en || v.ml : '')
  const exercises = a.recommended_exercise_ids.map(getExercise).filter(Boolean)

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
                <SuggestedExercise key={e.id} exercise={e} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-lg text-slate-600">{t('report.noSuggestions')}</p>
        )}
      </Section>

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
