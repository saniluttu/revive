import { Link, useSearchParams } from 'react-router-dom'
import { BODY_PARTS, exercisesFor } from '../exercises/library.js'

const DIFFICULTY_STYLE = {
  Easy: 'bg-brand-100 text-brand-800',
  Medium: 'bg-amber-100 text-amber-900',
  Hard: 'bg-red-100 text-red-800',
}

const VIEW_LABEL = { front: 'Face the camera', side: 'Stand side-on to the camera' }

function ExerciseCard({ exercise }) {
  return (
    <article className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-2xl font-bold">{exercise.name}</h3>
        <span className={`rounded-full px-3 py-1 text-base font-semibold ${DIFFICULTY_STYLE[exercise.difficulty]}`}>
          {exercise.difficulty}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-lg text-slate-700">
        <span>
          <strong>{exercise.reps}</strong> reps × <strong>{exercise.sets}</strong> sets
        </span>
        <span>{exercise.view === 'side' ? 'Side view' : 'Front view'}</span>
      </div>
      <ol className="list-decimal space-y-1 pl-6 text-lg text-slate-700">
        {exercise.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="text-base text-slate-500">
        {VIEW_LABEL[exercise.view]}. {exercise.setup}
      </p>
      <Link to={`/session?exercise=${exercise.id}`} className="btn-primary mt-auto">
        Start exercise
      </Link>
    </article>
  )
}

export default function ExerciseSelect() {
  const [params, setParams] = useSearchParams()
  const partId = params.get('part')
  const part = BODY_PARTS.find((p) => p.id === partId && p.available)

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Choose exercises</h1>
        <p className="mt-1 text-xl text-slate-600">Which part of your body are you working on?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BODY_PARTS.map((p) => {
          const selected = p.id === part?.id
          return (
            <button
              key={p.id}
              type="button"
              disabled={!p.available}
              onClick={() => setParams({ part: p.id })}
              aria-pressed={selected}
              className={`rounded-3xl border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-500'
              }`}
            >
              <span className="block text-2xl font-bold">{p.name}</span>
              <span className="mt-1 block text-base text-slate-600">{p.conditions}</span>
              {!p.available && <span className="mt-2 block text-base font-semibold text-slate-500">Coming soon</span>}
            </button>
          )
        })}
      </div>

      {part ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{part.name} exercises</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {exercisesFor(part.id).map((e) => (
              <ExerciseCard key={e.id} exercise={e} />
            ))}
          </div>
        </div>
      ) : (
        <p className="card text-lg text-slate-500">Pick a body part above to see its exercises.</p>
      )}
    </section>
  )
}
