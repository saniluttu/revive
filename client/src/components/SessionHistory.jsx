import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../reviews/plan.js'
import { BarChart, LineChart } from './charts.jsx'
import { perExercise, repsPerDay, shortDay, summarize } from './progressStats.js'
import { qualityTone, toneText } from './tone.js'
import { Empty, ErrorNote, Section, StatCard, StatGrid } from './ui.jsx'

const TREND_SESSIONS = 14
const QUALITY = '#00685f'
const PAIN = '#dc2626'

const exerciseName = (t, id) => t(`exercises.${id}.name`, { defaultValue: id })

function SummaryCards({ stats }) {
  const { t } = useTranslation()
  const pain = stats.pain
  return (
    <StatGrid>
      <StatCard label={t('history.thisWeek')} value={stats.sessionsThisWeek} />
      <StatCard label={t('history.totalReps')} value={stats.totalReps} />
      <StatCard label={t('history.avgQuality')} value={stats.avgQuality ?? t('common.dash')} tone={qualityTone(stats.avgQuality)} />
      <StatCard label={t('history.streak')} value={stats.streak} sub={t('history.days', { count: stats.streak })} />
      <StatCard
        label={t('history.painChange')}
        value={pain ? `${pain.from} → ${pain.to}` : t('common.dash')}
        sub={pain ? t(pain.change < 0 ? 'history.painBetter' : pain.change > 0 ? 'history.painWorse' : 'history.painSame') : t('history.noPain')}
        tone={!pain ? 'default' : pain.change < 0 ? 'good' : pain.change > 0 ? 'bad' : 'default'}
      />
    </StatGrid>
  )
}

function Mini({ label, value, className = '' }) {
  return (
    <div>
      <div className="text-sm font-semibold text-on-surface-variant">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${className}`}>{value}</div>
    </div>
  )
}

function ExerciseBreakdown({ sessions }) {
  const { t } = useTranslation()
  return (
    <Section title={t('history.byExercise')}>
      <div className="grid gap-3 md:grid-cols-2">
        {perExercise(sessions).map((r) => (
          <div key={r.exercise} className="rounded-xl bg-surface-container-low p-4 ring-1 ring-outline-variant/40">
            <div className="text-label-lg">{exerciseName(t, r.exercise)}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Mini label={t('history.sessions')} value={r.sessions} />
              <Mini label={t('history.reps')} value={r.reps} />
              <Mini label={t('history.avgQuality')} value={r.quality} className={toneText(qualityTone(r.quality))} />
            </div>
            {r.topMistake && (
              <div className="mt-2 text-base text-amber-700">
                {t('history.topMistake', { message: t(`rules.${r.topMistake.id}`), count: r.topMistake.count })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function RecentSessions({ sessions, limit }) {
  const { t, i18n } = useTranslation()
  return (
    <Section title={t('history.recent')}>
      <ul className="divide-y divide-outline-variant/40">
        {sessions.slice(0, limit).map((s) => {
          const moves = Object.entries(s.wrongMoves ?? {})
          return (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-body-lg">
              <div className="min-w-0">
                <div className="font-bold">{exerciseName(t, s.exercise)}</div>
                <div className="text-base text-on-surface-variant">{formatDate(s.date, i18n.language)}</div>
                <div className={`text-base ${moves.length ? 'text-amber-700' : 'text-primary'}`}>
                  {moves.length
                    ? moves.map(([id, n]) => t('session.faultCount', { message: t(`rules.${id}`), count: n })).join(' · ')
                    : t('history.noMistakes')}
                </div>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 text-right">
                <span>{t('history.repsInSets', { reps: s.reps, sets: s.sets })}</span>
                {s.painAfter != null && <span className="text-on-surface-variant">{t('history.pain', { pain: s.painAfter })}</span>}
                <span className={`font-bold ${toneText(qualityTone(s.quality))}`}>{t('history.quality', { quality: s.quality })}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/**
 * The full progress view: summary cards, quality trend, reps per day, pain before/after,
 * per-exercise breakdown and recent sessions. Used on Progress and the caregiver dashboard.
 */
export default function SessionHistory({ sessions, loading, error, limit = 10 }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  if (error) return <ErrorNote>{t('history.error')}</ErrorNote>
  if (loading) return <Empty>{t('common.pleaseWait')}</Empty>
  if (!sessions?.length) return <Empty>{t('history.empty')}</Empty>

  const recent = sessions.slice(0, TREND_SESSIONS).reverse() // oldest first
  const withPain = recent.filter((s) => s.painBefore != null || s.painAfter != null)

  return (
    <div className="space-y-4">
      <SummaryCards stats={summarize(sessions, now)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('history.qualityTrend')}>
          {recent.length < 2 ? (
            <p className="text-body-lg text-on-surface-variant">{t('history.needMore')}</p>
          ) : (
            <LineChart
              ariaLabel={t('history.qualityTrend')}
              max={100}
              series={[{ key: 'quality', label: t('history.trendQuality'), color: QUALITY }]}
              points={recent.map((s) => ({ label: shortDay(s.date, i18n.language), values: { quality: s.quality } }))}
            />
          )}
        </Section>

        <Section title={t('history.repsPerDay')}>
          <BarChart
            ariaLabel={t('history.repsPerDay')}
            bars={repsPerDay(sessions, 14, now).map((d) => ({ label: shortDay(d.date, i18n.language), value: d.reps }))}
          />
        </Section>
      </div>

      {withPain.length >= 2 && (
        <Section title={t('history.painTrend')}>
          <LineChart
            ariaLabel={t('history.painTrend')}
            max={10}
            series={[
              { key: 'before', label: t('history.painBefore'), color: '#f59e0b', dashed: true },
              { key: 'after', label: t('history.painAfter'), color: PAIN },
            ]}
            points={withPain.map((s) => ({ label: shortDay(s.date, i18n.language), values: { before: s.painBefore, after: s.painAfter } }))}
          />
        </Section>
      )}

      <ExerciseBreakdown sessions={sessions} />
      <RecentSessions sessions={sessions} limit={limit} />
    </div>
  )
}
