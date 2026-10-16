import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { EXERCISES } from '../exercises/library.js'
import { createRepCounter } from '../exercises/repCounter.js'
import useMessage from '../i18n/useMessage.js'
import { JOINTS } from '../pose/angles.js'
import usePoseTracker from '../pose/usePoseTracker.js'
import { doctorName, planExercises } from '../reviews/plan.js'
import { PlanExerciseList } from '../reviews/PlanStatus.jsx'
import useReviews, { useSessionExercise } from '../reviews/useReviews.js'
import { latestReviewFor, REVIEW_STATUS } from '../services/reviewService.js'
import { preloadCues, sayCues, stopCues, unlockAudio } from '../voice/cuePlayer.js'
import { cuesForUpdate } from '../voice/cues.js'
import VoiceAsk from '../voice/VoiceAsk.jsx'

const UI_INTERVAL_MS = 100 // push counter state to React at ~10 Hz

const BANNER_STYLE = {
  error: 'bg-red-600 text-white',
  warn: 'bg-amber-400 text-amber-950',
  good: 'bg-brand-600 text-white',
  info: 'bg-slate-800 text-white',
}

function qualityColor(q) {
  if (q == null) return 'text-slate-400'
  if (q >= 80) return 'text-brand-700'
  if (q >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function StatTile({ label, children, className = '' }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
      <div className="text-base font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-5xl font-extrabold tabular-nums sm:text-6xl ${className}`}>{children}</div>
    </div>
  )
}

function RangeMeter({ exercise, value }) {
  const { t } = useTranslation()
  const [lo, hi] = exercise.meter
  const pct = (v) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  const reached = value != null && value >= exercise.target
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex justify-between text-base font-semibold text-slate-600">
        <span>{t(`exercises.${exercise.id}.metricLabel`)}</span>
        <span className="tabular-nums">{value == null ? t('common.dash') : `${Math.round(value)}${exercise.unit}`}</span>
      </div>
      <div className="relative mt-2 h-6 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${reached ? 'bg-brand-500' : 'bg-sky-500'}`}
          style={{ width: value == null ? 0 : pct(value) }}
        />
        <div className="absolute inset-y-0 w-1 bg-slate-900" style={{ left: pct(exercise.target) }} title={t('session.target')} />
      </div>
      <div className="mt-1 text-sm text-slate-500">{t('session.targetHint')}</div>
    </div>
  )
}

// The AI plan from the latest report: locked while the review is pending, startable once approved
function YourPlan() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const review = latestReviewFor(user.uid, useReviews())
  if (!review || review.status === REVIEW_STATUS.REJECTED) return null
  const approved = review.status === REVIEW_STATUS.APPROVED
  const exercises = planExercises(approved ? review.plan : review.aiPlan)
  if (!exercises.length) return null
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">{t('review.yourPlan')}</h2>
      <p className="text-lg text-slate-600">{t(approved ? 'review.yourPlanApproved' : 'review.pendingText')}</p>
      <PlanExerciseList exercises={exercises} reviewId={review.id} locked={!approved} />
    </div>
  )
}

function PlanLocked() {
  const { t } = useTranslation()
  return (
    <div className="card space-y-3 bg-amber-50 ring-amber-200">
      <h2 className="text-2xl font-bold text-amber-950">{t('review.lockedTitle')}</h2>
      <p className="text-lg text-amber-950">{t('review.lockedLong')}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/home" className="btn-secondary">
          {t('review.seeStatus')}
        </Link>
        <Link to="/exercises" className="btn-secondary">
          {t('review.chooseManually')}
        </Link>
      </div>
    </div>
  )
}

function ExercisePicker() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <YourPlan />
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('review.allExercises')}</h2>
        <p className="text-xl text-slate-600">{t('session.pickExercise')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXERCISES.map((e) => (
            <Link key={e.id} to={`?exercise=${e.id}`} className="card block transition hover:ring-brand-500">
              <div className="text-2xl font-bold">{t(`exercises.${e.id}.name`)}</div>
              <div className="mt-1 text-lg text-slate-600">
                {t('session.repsSetsDifficulty', { reps: e.reps, sets: e.sets, difficulty: t(`difficulty.${e.difficulty}`) })}
              </div>
            </Link>
          ))}
        </div>
        <Link to="/exercises" className="inline-block text-lg font-semibold text-brand-700 underline">
          {t('session.browse')}
        </Link>
      </div>
    </div>
  )
}

function SessionDone({ snap, onRestart }) {
  const { t } = useTranslation()
  const counted = snap.history.filter((r) => r.counted)
  const notCounted = snap.history.length - counted.length
  const avg = Math.round(counted.reduce((s, r) => s + r.quality, 0) / (counted.length || 1))
  const faultCounts = {}
  for (const r of snap.history) for (const f of r.faults) faultCounts[f] = (faultCounts[f] ?? 0) + 1
  return (
    <div className="card space-y-4">
      <h2 className="text-3xl font-bold text-brand-800">{t('session.wellDone')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={t('session.totalReps')}>{snap.totalReps}</StatTile>
        <StatTile label={t('session.sets')}>{snap.sets}</StatTile>
        <StatTile label={t('session.avgQuality')} className={qualityColor(avg)}>
          {avg}
        </StatTile>
      </div>
      {notCounted > 0 && (
        <p className="text-lg font-semibold text-red-700">{t('session.notCountedSummary', { count: notCounted })}</p>
      )}
      {Object.keys(faultCounts).length > 0 && (
        <div className="text-lg">
          <div className="font-semibold">{t('session.workOn')}</div>
          <ul className="list-disc pl-6 text-slate-700">
            {Object.entries(faultCounts).map(([id, n]) => (
              <li key={id}>{t('session.faultCount', { message: t(`rules.${id}`), count: n })}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={onRestart}>
          {t('session.again')}
        </button>
        <Link to="/exercises" className="btn-secondary">
          {t('session.another')}
        </Link>
      </div>
    </div>
  )
}

export default function LiveSession() {
  const { t, i18n } = useTranslation()
  const tm = useMessage()
  const [params, setParams] = useSearchParams()
  const { exercise, planLocked, planReviewer } = useSessionExercise(params.get('exercise'), params.get('plan'))

  const counterRef = useRef(null)
  const lastUiRef = useRef({ time: 0, attempts: 0, status: null })
  const [snap, setSnap] = useState(null)
  // Spoken cues (F7): played from the pre-generated pack, in the UI language
  const prevSnapRef = useRef(null)
  const [cuesOn, setCuesOn] = useState(true)
  const cuesOnRef = useRef(true)
  const assistantBusyRef = useRef(false)

  const resetCounter = useCallback(() => {
    counterRef.current = exercise ? createRepCounter(exercise) : null
    prevSnapRef.current = null
    setSnap(counterRef.current?.snapshot() ?? null)
  }, [exercise])

  useEffect(resetCounter, [resetCounter])

  const onFrame = useCallback((landmarks, _angles, { width, height }) => {
    const counter = counterRef.current
    if (!counter) return
    const next = counter.update(landmarks, width, height)
    const cues = cuesForUpdate(prevSnapRef.current, next)
    prevSnapRef.current = next
    if (cues && cuesOnRef.current && !assistantBusyRef.current) sayCues(cues, i18n.language)
    // Rep finished (counted or not) or status change → update immediately; otherwise throttle
    const now = performance.now()
    const last = lastUiRef.current
    if (next.attempts !== last.attempts || next.status !== last.status || now - last.time >= UI_INTERVAL_MS) {
      lastUiRef.current = { time: now, attempts: next.attempts, status: next.status }
      setSnap(next)
    }
  }, [i18n])

  useEffect(() => {
    if (exercise) preloadCues(i18n.language)
  }, [exercise, i18n.language])

  useEffect(() => stopCues, [])

  function toggleCues() {
    cuesOnRef.current = !cuesOn
    if (cuesOn) stopCues()
    setCuesOn(!cuesOn)
  }

  const onAssistantBusy = useCallback((busy) => {
    assistantBusyRef.current = busy
    if (busy) stopCues() // don't talk over the patient or the assistant
  }, [])

  const { videoRef, canvasRef, status, error, angles, missing, fps, start, stop } = usePoseTracker({ onFrame })
  const running = status === 'running'
  const framingWarning = exercise ? snap?.missing?.length > 0 : missing.length > 0

  function startCamera() {
    unlockAudio() // a click lets the browser play the cues
    start()
  }

  function stopCamera() {
    stopCues()
    stop()
  }

  function skipRest() {
    setSnap(counterRef.current.skipRest())
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{exercise ? t(`exercises.${exercise.id}.name`) : t('session.title')}</h1>
          {planReviewer && (
            <p className="mt-1 text-lg font-semibold text-brand-700">
              {t('review.fromPlan', { name: doctorName(t, planReviewer.name) })}
            </p>
          )}
          {exercise && (
            <select
              className="mt-2 max-w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-lg"
              value={exercise.id}
              onChange={(e) => setParams({ exercise: e.target.value })}
              aria-label={t('session.exercise')}
            >
              {EXERCISES.map((e) => (
                <option key={e.id} value={e.id}>
                  {t(`exercises.${e.id}.name`)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {exercise && (
            <button type="button" className="btn-secondary" onClick={toggleCues} aria-pressed={cuesOn}>
              {t(cuesOn ? 'voice.cuesOn' : 'voice.cuesOff')}
            </button>
          )}
          {running ? (
            <button className="btn-secondary" onClick={stopCamera}>
              {t('session.stopCamera')}
            </button>
          ) : (
            <button className="btn-primary" onClick={startCamera} disabled={status === 'loading'}>
              {status === 'loading' ? t('session.starting') : t('session.startCamera')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
          {tm(error)}
        </div>
      )}

      {planLocked && <PlanLocked />}
      {!exercise && !planLocked && <ExercisePicker />}

      {exercise && snap && (
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4 shadow ${
            BANNER_STYLE[running ? snap.correction.kind : 'info']
          }`}
        >
          <span className="text-2xl font-bold sm:text-4xl">
            {running ? tm(snap.correction) : t('session.pressStart', { setup: t(`exercises.${exercise.id}.setup`) })}
          </span>
          {snap.status === 'rest' && (
            <button type="button" className="btn bg-white px-4 py-2 text-brand-800 hover:bg-brand-50" onClick={skipRest}>
              {t('session.nextSetNow')}
            </button>
          )}
        </div>
      )}

      {exercise && snap?.status === 'done' && <SessionDone snap={snap} onRestart={resetCounter} />}

      <div className={`grid gap-4 ${exercise ? 'lg:grid-cols-3' : ''}`}>
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-slate-900 lg:col-span-2">
          {/* Mirrored so movement feels natural, like a mirror */}
          <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />

          {!running && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xl text-slate-300">
              {status === 'loading' ? t('session.loadingModel') : t('session.pressStartShort')}
            </div>
          )}

          {running && framingWarning && (
            <div className="absolute inset-x-3 top-3 rounded-2xl bg-amber-400 px-4 py-3 text-center text-xl font-bold text-amber-950 shadow-lg">
              {t('session.framing')}
            </div>
          )}

          {running && exercise && snap?.status === 'calibrating' && (
            <div className="absolute inset-x-6 bottom-6 h-3 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white" style={{ width: `${snap.calibrationProgress * 100}%` }} />
            </div>
          )}

          {running && exercise && snap?.viewMismatch && !framingWarning && (
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-4 py-2 text-center text-lg text-white">
              {t(exercise.view === 'side' ? 'session.tipSide' : 'session.tipFront')}
            </div>
          )}

          {running && (
            <div className="absolute right-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-sm text-white">{t('session.fps', { fps })}</div>
          )}
        </div>

        {exercise && snap && (
          <div className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <StatTile label={t('session.reps')}>
                {snap.reps}
                <span className="text-3xl text-slate-400">/{snap.targetReps}</span>
              </StatTile>
              <StatTile label={t('session.set')}>
                {snap.set}
                <span className="text-3xl text-slate-400">/{snap.sets}</span>
              </StatTile>
            </div>
            <StatTile label={t('session.lastQuality')} className={qualityColor(snap.lastRep?.quality)}>
              {snap.lastRep?.quality ?? t('common.dash')}
              {snap.setAverage != null && (
                <span className="mt-1 block text-lg font-semibold text-slate-500">
                  {t('session.setAverage', { avg: snap.setAverage })}
                </span>
              )}
            </StatTile>
            <RangeMeter exercise={exercise} value={running ? snap.value : null} />
          </div>
        )}
      </div>

      <VoiceAsk exerciseId={exercise?.id ?? null} onBusyChange={onAssistantBusy} />

      {exercise && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="mb-2 text-2xl font-bold">{t('session.howTo')}</h2>
            <p className="mb-2 text-lg text-slate-600">{t(`exercises.${exercise.id}.setup`)}</p>
            <ol className="list-decimal space-y-1 pl-6 text-lg">
              {t(`exercises.${exercise.id}.steps`, { returnObjects: true }).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 text-base text-slate-400">{t('session.avatarSoon')}</p>
          </div>
          <div className="card">
            <h2 className="mb-3 text-2xl font-bold">{t('session.repsSoFar')}</h2>
            {snap?.history.length ? (
              <div className="flex flex-wrap gap-2">
                {snap.history.map((r, i) =>
                  r.counted ? (
                    <span
                      key={i}
                      title={r.faults.map((f) => t(`rules.${f}`)).join(', ') || t('session.goodForm')}
                      className={`rounded-xl px-3 py-2 text-lg font-bold ring-1 ring-slate-200 ${qualityColor(r.quality)}`}
                    >
                      {r.set}.{r.rep}: {r.quality}
                      {r.faults.length > 0 && ' ⚠'}
                    </span>
                  ) : (
                    <span key={i} className="rounded-xl bg-red-50 px-3 py-2 text-lg font-semibold text-red-800 ring-1 ring-red-200">
                      {t('session.notCounted', { reason: t(`rules.${r.reason}`) })}
                    </span>
                  ),
                )}
              </div>
            ) : (
              <p className="text-lg text-slate-500">{t('session.noReps')}</p>
            )}
          </div>
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer text-xl font-bold">{t('session.jointAngles')}</summary>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {JOINTS.map((j) => (
            <div key={j.key} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-base font-semibold text-slate-600">{t(`joints.${j.key}`)}</div>
              <div className="text-2xl font-bold tabular-nums">
                {angles[j.key] == null ? t('common.dash') : `${Math.round(angles[j.key])}°`}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
