import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EXERCISES, getExercise } from '../exercises/library.js'
import { createRepCounter } from '../exercises/repCounter.js'
import { RULES } from '../exercises/rules.js'
import { JOINTS } from '../pose/angles.js'
import usePoseTracker from '../pose/usePoseTracker.js'

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
  const [lo, hi] = exercise.meter
  const pct = (v) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  const reached = value != null && value >= exercise.target
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex justify-between text-base font-semibold text-slate-600">
        <span>{exercise.metricLabel}</span>
        <span className="tabular-nums">{value == null ? '—' : `${Math.round(value)}${exercise.unit}`}</span>
      </div>
      <div className="relative mt-2 h-6 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${reached ? 'bg-brand-500' : 'bg-sky-500'}`}
          style={{ width: value == null ? 0 : pct(value) }}
        />
        <div className="absolute inset-y-0 w-1 bg-slate-900" style={{ left: pct(exercise.target) }} title="Target" />
      </div>
      <div className="mt-1 text-sm text-slate-500">Black line = target</div>
    </div>
  )
}

function ExercisePicker() {
  return (
    <div className="space-y-4">
      <p className="text-xl text-slate-600">Pick an exercise to start.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXERCISES.map((e) => (
          <Link key={e.id} to={`?exercise=${e.id}`} className="card block transition hover:ring-brand-500">
            <div className="text-2xl font-bold">{e.name}</div>
            <div className="mt-1 text-lg text-slate-600">
              {e.reps} reps × {e.sets} sets · {e.difficulty}
            </div>
          </Link>
        ))}
      </div>
      <Link to="/exercises" className="inline-block text-lg font-semibold text-brand-700 underline">
        Browse by body part
      </Link>
    </div>
  )
}

function SessionDone({ snap, onRestart }) {
  const avg = Math.round(snap.history.reduce((s, r) => s + r.quality, 0) / (snap.history.length || 1))
  const faultCounts = {}
  for (const r of snap.history) for (const f of r.faults) faultCounts[f] = (faultCounts[f] ?? 0) + 1
  return (
    <div className="card space-y-4">
      <h2 className="text-3xl font-bold text-brand-800">Well done!</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Total reps">{snap.totalReps}</StatTile>
        <StatTile label="Sets">{snap.sets}</StatTile>
        <StatTile label="Avg quality" className={qualityColor(avg)}>
          {avg}
        </StatTile>
      </div>
      {Object.keys(faultCounts).length > 0 && (
        <div className="text-lg">
          <div className="font-semibold">Things to work on:</div>
          <ul className="list-disc pl-6 text-slate-700">
            {Object.entries(faultCounts).map(([id, n]) => (
              <li key={id}>
                {RULES[id].message} ({n} {n === 1 ? 'rep' : 'reps'})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={onRestart}>
          Do it again
        </button>
        <Link to="/exercises" className="btn-secondary">
          Choose another exercise
        </Link>
      </div>
    </div>
  )
}

export default function LiveSession() {
  const [params, setParams] = useSearchParams()
  const exercise = getExercise(params.get('exercise'))

  const counterRef = useRef(null)
  const lastUiRef = useRef({ time: 0, totalReps: 0, status: null })
  const [snap, setSnap] = useState(null)

  const resetCounter = useCallback(() => {
    counterRef.current = exercise ? createRepCounter(exercise) : null
    setSnap(counterRef.current?.snapshot() ?? null)
  }, [exercise])

  useEffect(resetCounter, [resetCounter])

  const onFrame = useCallback((landmarks, _angles, { width, height }) => {
    const counter = counterRef.current
    if (!counter) return
    const next = counter.update(landmarks, width, height)
    // Rep counted or status change → update immediately; otherwise throttle
    const now = performance.now()
    const last = lastUiRef.current
    if (next.totalReps !== last.totalReps || next.status !== last.status || now - last.time >= UI_INTERVAL_MS) {
      lastUiRef.current = { time: now, totalReps: next.totalReps, status: next.status }
      setSnap(next)
    }
  }, [])

  const { videoRef, canvasRef, status, error, angles, missing, fps, start, stop } = usePoseTracker({ onFrame })
  const running = status === 'running'
  const framingWarning = exercise ? snap?.missing?.length > 0 : missing.length > 0

  function skipRest() {
    setSnap(counterRef.current.skipRest())
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{exercise ? exercise.name : 'Live Session'}</h1>
          {exercise && (
            <select
              className="mt-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-lg"
              value={exercise.id}
              onChange={(e) => setParams({ exercise: e.target.value })}
              aria-label="Exercise"
            >
              {EXERCISES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {running ? (
          <button className="btn-secondary" onClick={stop}>
            Stop camera
          </button>
        ) : (
          <button className="btn-primary" onClick={start} disabled={status === 'loading'}>
            {status === 'loading' ? 'Starting…' : 'Start camera'}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {!exercise && <ExercisePicker />}

      {exercise && snap && (
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4 shadow ${
            BANNER_STYLE[running ? snap.correction.kind : 'info']
          }`}
        >
          <span className="text-2xl font-bold sm:text-4xl">
            {running ? snap.correction.text : `Press "Start camera". ${exercise.setup}`}
          </span>
          {snap.status === 'rest' && (
            <button type="button" className="btn bg-white px-4 py-2 text-brand-800 hover:bg-brand-50" onClick={skipRest}>
              Start next set now
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
              {status === 'loading' ? 'Loading pose model…' : 'Press "Start camera" to begin'}
            </div>
          )}

          {running && framingWarning && (
            <div className="absolute inset-x-3 top-3 rounded-2xl bg-amber-400 px-4 py-3 text-center text-xl font-bold text-amber-950 shadow-lg">
              Step back — full body not visible
            </div>
          )}

          {running && exercise && snap?.status === 'calibrating' && (
            <div className="absolute inset-x-6 bottom-6 h-3 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white" style={{ width: `${snap.calibrationProgress * 100}%` }} />
            </div>
          )}

          {running && exercise && snap?.viewMismatch && !framingWarning && (
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-4 py-2 text-center text-lg text-white">
              Tip: {exercise.view === 'side' ? 'turn side-on to the camera' : 'face the camera'} for best tracking
            </div>
          )}

          {running && (
            <div className="absolute right-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-sm text-white">{fps} fps</div>
          )}
        </div>

        {exercise && snap && (
          <div className="grid content-start gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <StatTile label="Reps">
                {snap.reps}
                <span className="text-3xl text-slate-400">/{snap.targetReps}</span>
              </StatTile>
              <StatTile label="Set">
                {snap.set}
                <span className="text-3xl text-slate-400">/{snap.sets}</span>
              </StatTile>
            </div>
            <StatTile label="Last rep quality" className={qualityColor(snap.lastRep?.quality)}>
              {snap.lastRep?.quality ?? '—'}
              {snap.setAverage != null && (
                <span className="mt-1 block text-lg font-semibold text-slate-500">Set average {snap.setAverage}</span>
              )}
            </StatTile>
            <RangeMeter exercise={exercise} value={running ? snap.value : null} />
          </div>
        )}
      </div>

      {exercise && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="mb-2 text-2xl font-bold">How to do it</h2>
            <p className="mb-2 text-lg text-slate-600">{exercise.setup}</p>
            <ol className="list-decimal space-y-1 pl-6 text-lg">
              {exercise.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 text-base text-slate-400">Avatar demonstration coming soon.</p>
          </div>
          <div className="card">
            <h2 className="mb-3 text-2xl font-bold">Reps so far</h2>
            {snap?.history.length ? (
              <div className="flex flex-wrap gap-2">
                {snap.history.map((r) => (
                  <span
                    key={`${r.set}-${r.rep}`}
                    title={r.faults.map((f) => RULES[f].message).join(', ') || 'Good form'}
                    className={`rounded-xl px-3 py-2 text-lg font-bold ring-1 ring-slate-200 ${qualityColor(r.quality)}`}
                  >
                    {r.set}.{r.rep}: {r.quality}
                    {r.faults.length > 0 && ' ⚠'}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-lg text-slate-500">No reps yet.</p>
            )}
          </div>
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer text-xl font-bold">Joint angles</summary>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {JOINTS.map((j) => (
            <div key={j.key} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-base font-semibold text-slate-600">{j.label}</div>
              <div className="text-2xl font-bold tabular-nums">
                {angles[j.key] == null ? '—' : `${Math.round(angles[j.key])}°`}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
