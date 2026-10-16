import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import AvatarPanel from '../avatar/AvatarPanel.jsx'
import ExerciseImages from '../components/ExerciseImages.jsx'
import { BODY_PARTS, exercisesFor } from '../exercises/library.js'
import useReviews from '../reviews/useReviews.js'
import { latestReviewFor, REVIEW_STATUS } from '../services/reviewService.js'
import { preloadCues } from '../voice/cuePlayer.js'
import InstructionSteps, { ReadAloudToggle } from '../voice/InstructionSteps.jsx'
import useInstructions, { useReadAloud } from '../voice/useInstructions.js'

const DIFFICULTY_STYLE = {
  easy: 'bg-primary-fixed/50 text-primary',
  medium: 'bg-amber-100 text-amber-900',
  hard: 'bg-red-100 text-error',
}

// `autoPlay`: read the steps aloud as soon as the card appears (after a click, so audio may play)
function ExerciseCard({ exercise, autoPlay }) {
  const { t } = useTranslation()
  const ex = `exercises.${exercise.id}`
  const instructions = useInstructions(exercise.id)
  const { play } = instructions
  useEffect(() => {
    if (autoPlay) play()
  }, [autoPlay, play])
  return (
    <article className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-headline-md">{t(`${ex}.name`)}</h3>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1 text-base font-semibold ${DIFFICULTY_STYLE[exercise.difficulty]}`}
        >
          {t(`difficulty.${exercise.difficulty}`)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-lg text-on-surface-variant">
        <span>
          <Trans
            i18nKey="exerciseSelect.repsSets"
            values={{ reps: exercise.reps, sets: exercise.sets }}
            components={{ b: <strong /> }}
          />
        </span>
        <span>{t(exercise.view === 'side' ? 'exerciseSelect.sideView' : 'exerciseSelect.frontView')}</span>
      </div>
      <ExerciseImages id={exercise.id} />
      <AvatarPanel exercise={exercise} step={instructions.step} className="h-[32rem]" />
      <InstructionSteps exercise={exercise} player={instructions} />
      <Link to={`/session?exercise=${exercise.id}`} className="btn-primary mt-auto">
        {t('exerciseSelect.start')}
      </Link>
    </article>
  )
}

export default function ExerciseSelect() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const partId = params.get('part')
  const part = BODY_PARTS.find((p) => p.id === partId && p.available)
  const { user } = useAuth()
  const [readAloud] = useReadAloud()
  const [autoPlayPart, setAutoPlayPart] = useState(null) // body part just clicked
  const hasApprovedPlan = latestReviewFor(user.uid, useReviews())?.status === REVIEW_STATUS.APPROVED

  useEffect(() => {
    if (part) preloadCues(i18n.language)
  }, [part, i18n.language])

  return (
    <section className="space-y-6">
      <div>
        <h1 className="page-title">{t('exerciseSelect.title')}</h1>
        <p className="page-subtitle">{t('exerciseSelect.subtitle')}</p>
      </div>

      {!hasApprovedPlan && (
        <p role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sky-50 p-4 text-body-lg text-sky-950 ring-1 ring-sky-200">
          <span className="font-semibold">{t('review.recommended')}</span>
          <Link to="/report" className="font-semibold text-primary underline">
            {t('review.recommendedLink')}
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BODY_PARTS.map((p) => {
          const selected = p.id === part?.id
          return (
            <button
              key={p.id}
              type="button"
              disabled={!p.available}
              onClick={() => {
                setParams({ part: p.id })
                setAutoPlayPart(readAloud ? p.id : null)
              }}
              aria-pressed={selected}
              className={`rounded-xl border-2 p-4 text-left sm:p-5 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? 'border-primary bg-surface-container-low' : 'border-outline-variant/60 bg-surface-container-lowest hover:border-primary'
              }`}
            >
              <span className="block text-label-lg sm:text-2xl">{t(`bodyParts.${p.id}.name`)}</span>
              <span className="mt-1 block text-base text-on-surface-variant">{t(`bodyParts.${p.id}.conditions`)}</span>
              {!p.available && (
                <span className="mt-2 block text-base font-semibold text-on-surface-variant">{t('exerciseSelect.comingSoon')}</span>
              )}
            </button>
          )
        })}
      </div>

      {part ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-headline-md">{t('exerciseSelect.partExercises', { part: t(`bodyParts.${part.id}.name`) })}</h2>
            <ReadAloudToggle />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {exercisesFor(part.id).map((e, i) => (
              <ExerciseCard key={e.id} exercise={e} autoPlay={i === 0 && autoPlayPart === part.id} />
            ))}
          </div>
        </div>
      ) : (
        <p className="card text-body-lg text-on-surface-variant">{t('exerciseSelect.pickPart')}</p>
      )}
    </section>
  )
}
