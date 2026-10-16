import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/index.js'
import { Icon } from './ui.jsx'

const en = i18n.getFixedT('en')
const ml = i18n.getFixedT('ml')

/** Alt text in both languages, so it reads well whichever language a screen reader uses. */
function altText(id, pose) {
  const one = (t) => t('exerciseImages.alt', { name: t(`exercises.${id}.name`), pose: t(`exerciseImages.${pose}`) })
  return `${one(en)} / ${one(ml)}`
}

/**
 * The movement as two pictures, start → peak, rendered from the 3D avatar
 * (public/images/exercises, see scripts/render-exercise-images.js).
 * `size`: 'sm' for list rows, 'md' for cards.
 */
export default function ExerciseImages({ id, size = 'md', className = '' }) {
  const { t } = useTranslation()
  const img = size === 'sm' ? 'w-24 sm:w-28' : 'min-w-0 flex-1'
  return (
    <figure className={`space-y-1 ${className}`}>
      <div className={`flex items-center gap-1 ${size === 'sm' ? '' : 'rounded-xl bg-surface-container-low p-2'}`}>
        {['start', 'peak'].map((pose, i) => (
          <Fragment key={pose}>
            {i === 1 && <Icon name="arrow_forward" className="shrink-0 text-primary" />}
            <img
              src={`/images/exercises/${id}-${pose}.png`}
              alt={altText(id, pose)}
              loading="lazy"
              decoding="async"
              width="520"
              height="400"
              className={`${img} aspect-[13/10] rounded-lg bg-surface-container-lowest object-contain`}
            />
          </Fragment>
        ))}
      </div>
      <figcaption className="text-base text-on-surface-variant">
        {t('exerciseImages.caption', { start: t('exerciseImages.start'), peak: t('exerciseImages.peak') })}
      </figcaption>
    </figure>
  )
}
