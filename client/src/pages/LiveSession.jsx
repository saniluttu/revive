import { JOINTS } from '../pose/angles.js'
import usePoseTracker from '../pose/usePoseTracker.js'

function AngleCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-base font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
        {value == null ? '—' : `${Math.round(value)}°`}
      </div>
    </div>
  )
}

export default function LiveSession() {
  const { videoRef, canvasRef, status, error, angles, missing, fps, start, stop } = usePoseTracker()
  const running = status === 'running'
  const fullBodyMissing = running && missing.length > 0

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold sm:text-4xl">Live Session</h1>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Avatar demo goes here in Phase 7 */}
        <div className="card flex min-h-64 items-center justify-center text-center text-xl text-slate-400">
          Exercise demo avatar
          <br />
          (coming soon)
        </div>

        <div className="relative aspect-video overflow-hidden rounded-3xl bg-slate-900">
          {/* Mirrored so movement feels natural, like a mirror */}
          <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />

          {!running && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xl text-slate-300">
              {status === 'loading' ? 'Loading pose model…' : 'Press "Start camera" to begin'}
            </div>
          )}

          {fullBodyMissing && (
            <div
              role="status"
              className="absolute inset-x-3 top-3 rounded-2xl bg-amber-400 px-4 py-3 text-center text-xl font-bold text-amber-950 shadow-lg"
            >
              Step back — full body not visible
            </div>
          )}

          {running && (
            <div className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-2 py-1 text-sm text-white">{fps} fps</div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-2xl font-bold">Joint angles</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {JOINTS.map((j) => (
            <AngleCard key={j.key} label={j.label} value={angles[j.key]} />
          ))}
        </div>
      </div>
    </section>
  )
}
