import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage } from '../i18n/index.js'

/** "EN | മലയാളം" switch. Each label is shown in its own language and font. */
export default function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <div role="group" aria-label={t('language.label')} className="flex shrink-0 rounded-full bg-surface-container-low p-1 ring-1 ring-outline-variant/50">
      {LANGUAGES.map((lng) => {
        const active = i18n.language === lng
        return (
          <button
            key={lng}
            type="button"
            lang={lng}
            aria-pressed={active}
            onClick={() => setLanguage(lng)}
            className={`whitespace-nowrap rounded-full px-2 py-1 text-sm font-semibold transition sm:px-3 sm:py-1.5 sm:text-base ${
              active ? 'bg-primary text-on-primary shadow-soft' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t(`language.${lng}`)}
          </button>
        )
      })}
    </div>
  )
}
