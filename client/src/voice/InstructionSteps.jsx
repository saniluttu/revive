import { useTranslation } from 'react-i18next'
import { useReadAloud } from './useInstructions.js'

/** "Read instructions aloud" — on by default, remembered on this device. */
export function ReadAloudToggle() {
  const { t } = useTranslation()
  const [on, setOn] = useReadAloud()
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-body-lg font-semibold">
      <input type="checkbox" className="h-6 w-6 accent-brand-600" checked={on} onChange={(e) => setOn(e.target.checked)} />
      {t('voice.instructions.readAloud')}
    </label>
  )
}

/**
 * An exercise's setup and steps, with Listen / Pause / Stop. The step being
 * read is highlighted.
 * @param exercise  library exercise
 * @param player    from useInstructions(exercise.id)
 */
export default function InstructionSteps({ exercise, player, className = '' }) {
  const { t } = useTranslation()
  const ex = `exercises.${exercise.id}`
  const { state, step, play, pause, resume, stop } = player
  const highlight = (active) => (active ? 'rounded-xl bg-primary-fixed/50 font-semibold text-primary' : '')

  return (
    <div className={`space-y-3 ${className}`}>
      <p className={`px-2 py-1 text-body-lg text-on-surface-variant transition ${highlight(step === -1)}`}>{t(`${ex}.setup`)}</p>
      <ol className="list-decimal space-y-1 pl-8 text-body-lg">
        {t(`${ex}.steps`, { returnObjects: true }).map((s, i) => (
          <li key={s} className={`px-2 py-1 transition ${highlight(step === i)}`} aria-current={step === i ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {state === 'idle' && (
          <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={play}>
            🔊 {t('voice.instructions.listen')}
          </button>
        )}
        {state === 'playing' && (
          <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={pause}>
            {t('voice.instructions.pause')}
          </button>
        )}
        {state === 'paused' && (
          <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={resume}>
            {t('voice.instructions.resume')}
          </button>
        )}
        {state !== 'idle' && (
          <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={stop}>
            {t('voice.instructions.stop')}
          </button>
        )}
      </div>
    </div>
  )
}
