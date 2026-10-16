import { useTranslation } from 'react-i18next'
import LanguageToggle from './LanguageToggle.jsx'

/** Shown instead of the app when the Firebase web config isn't set (no blank page). */
export default function FirebaseMissing({ missing }) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div role="alert" className="card space-y-4 ring-red-200">
        <h1 className="text-3xl font-bold text-error">{t('firebaseMissing.title')}</h1>
        <p className="text-body-lg text-on-surface-variant">{t('firebaseMissing.text')}</p>
        <div>
          <div className="text-base font-semibold text-on-surface-variant">{t('firebaseMissing.vars')}</div>
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name}>
                <code className="rounded-lg bg-surface-container px-2 py-1 text-base">{name}</code>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-lg text-on-surface-variant">{t('firebaseMissing.hint')}</p>
      </div>
    </main>
  )
}
