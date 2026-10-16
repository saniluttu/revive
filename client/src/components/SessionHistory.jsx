import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../reviews/plan.js'

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_SESSIONS = 14

function qualityColor(q) {
  if (q >= 80) return 'text-brand-700'
  if (q >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function Tile({ label, children }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
      <div className="text-base font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">{children}</div>
    </div>
  )
}

/**
 * Line chart of up to two series over the last sessions, oldest → newest.
 * Values are 0–100 (quality) or 0–10 (pain, scaled ×10).
 */
function TrendChart({ sessions }) {
  const { t, i18n } = useTranslation()
  const points = sessions.slice(0, TREND_SESSIONS).reverse()
  const series = [
    { key: 'quality', label: t('history.trendQuality'), color: '#059669', value: (s) => s.quality },
    { key: 'pain', label: t('history.trendPain'), color: '#dc2626', value: (s) => (s.painAfter == null ? null : s.painAfter * 10) },
  ].filter((ser) => points.some((p) => ser.value(p) != null))
  if (points.length < 2) return null

  const W = 600
  const H = 200
  const pad = { l: 36, r: 12, t: 12, b: 28 }
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1)
  const y = (v) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100
  const day = (iso) => new Intl.DateTimeFormat(i18n.language === 'ml' ? 'ml-IN' : 'en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso))

  return (
    <figure className="card space-y-3">
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold">
        {series.map((ser) => (
          <span key={ser.key} className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-6 rounded-full" style={{ background: ser.color }} />
            {ser.label}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#64748b">
              {v}
            </text>
          </g>
        ))}
        {series.map((ser) => {
          const pts = points.map((p, i) => [x(i), ser.value(p)]).filter(([, v]) => v != null)
          return (
            <g key={ser.key}>
              <polyline
                fill="none"
                stroke={ser.color}
                strokeWidth="3"
                strokeLinejoin="round"
                points={pts.map(([px, v]) => `${px},${y(v)}`).join(' ')}
              />
              {pts.map(([px, v], i) => (
                <circle key={i} cx={px} cy={y(v)} r="4" fill={ser.color} />
              ))}
            </g>
          )
        })}
        {[0, points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} fontSize="12" fill="#64748b">
            {day(points[i].date)}
          </text>
        ))}
      </svg>
    </figure>
  )
}

/** Summary tiles, quality/pain trend and recent sessions (Progress page and caregiver dashboard). */
export default function SessionHistory({ sessions, loading, error, limit = 10 }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  if (error) return <p className="card text-lg font-semibold text-red-700">{t('history.error')}</p>
  if (loading) return <p className="card text-lg text-slate-500">{t('common.pleaseWait')}</p>
  if (!sessions?.length) return <p className="card text-lg text-slate-500">{t('history.empty')}</p>

  const weekAgo = now - 7 * DAY_MS
  const thisWeek = sessions.filter((s) => new Date(s.date).getTime() >= weekAgo)
  const avg = Math.round(sessions.slice(0, TREND_SESSIONS).reduce((sum, s) => sum + s.quality, 0) / Math.min(sessions.length, TREND_SESSIONS))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('history.thisWeek')}>{thisWeek.length}</Tile>
        <Tile label={t('history.repsThisWeek')}>{thisWeek.reduce((sum, s) => sum + s.reps, 0)}</Tile>
        <Tile label={t('history.avgQuality')}>
          <span className={qualityColor(avg)}>{avg}</span>
        </Tile>
        <Tile label={t('history.lastSession')}>
          <span className="block text-lg font-bold sm:text-xl">{formatDate(sessions[0].date, i18n.language)}</span>
        </Tile>
      </div>

      <TrendChart sessions={sessions} />

      <div className="card space-y-3">
        <h3 className="text-2xl font-bold">{t('history.recent')}</h3>
        <ul className="divide-y divide-slate-200">
          {sessions.slice(0, limit).map((s) => {
            const moves = Object.entries(s.wrongMoves ?? {})
            return (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-lg">
                <div className="min-w-0">
                  <div className="font-bold">{t(`exercises.${s.exercise}.name`, { defaultValue: s.exercise })}</div>
                  <div className="text-base text-slate-500">{formatDate(s.date, i18n.language)}</div>
                  {moves.length > 0 && (
                    <div className="text-base text-amber-700">
                      {moves.map(([id, n]) => t('session.faultCount', { message: t(`rules.${id}`), count: n })).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-4 text-right">
                  <span>{t('history.repsInSets', { reps: s.reps, sets: s.sets })}</span>
                  {s.painAfter != null && <span className="text-slate-600">{t('history.pain', { pain: s.painAfter })}</span>}
                  <span className={`font-bold ${qualityColor(s.quality)}`}>{t('history.quality', { quality: s.quality })}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
