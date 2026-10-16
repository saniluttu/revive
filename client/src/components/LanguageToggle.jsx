import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage } from '../i18n/index.js'

/** "EN | മലയാളം" switch. Each label is shown in its own language and font. */
export default function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <div role="group" aria-label={t('language.label')} className="flex shrink-0 rounded-xl bg-slate-100 p-1">
      {LANGUAGES.map((lng) => {
        const active = i18n.language === lng
        return (
          <button
            key={lng}
            type="button"
            lang={lng}
            aria-pressed={active}
            onClick={() => setLanguage(lng)}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-base font-semibold transition ${
              active ? 'bg-white text-brand-700 shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(`language.${lng}`)}
          </button>
        )
      })}
    </div>
  )
}
