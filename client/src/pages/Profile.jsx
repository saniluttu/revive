import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import i18n, { setLanguage as setUiLanguage } from '../i18n/index.js'
import { updateProfile } from '../services/authService.js'

const GENDERS = [
  { value: 'female', label: 'profile.female' },
  { value: 'male', label: 'profile.male' },
  { value: 'other', label: 'profile.other' },
]

const LANGUAGES = [
  { value: 'ml', label: 'profile.malayalam', hint: 'profile.malayalamHint', lang: 'ml' },
  { value: 'en', label: 'profile.english', hint: 'profile.englishHint', lang: 'en' },
]

function ChoiceGroup({ legend, name, options, value, onChange }) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-2 text-body-lg font-semibold">{legend}</legend>
      <div className={`grid gap-3 ${options.length === 3 ? 'grid-cols-1 min-[400px]:grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-xl border-2 px-3 py-3 text-center transition ${
              value === o.value ? 'border-primary bg-surface-container-low' : 'border-outline-variant/60 hover:border-outline-variant'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span lang={o.lang} className="block text-label-lg">
              {t(o.label)}
            </span>
            {o.hint && t(o.hint) !== t(o.label) && <span className="block text-base text-on-surface-variant">{t(o.hint)}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function Profile() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const existing = user?.profile
  const isSetup = !existing

  const [name, setName] = useState(existing?.name ?? '')
  const [age, setAge] = useState(existing?.age?.toString() ?? '')
  const [gender, setGender] = useState(existing?.gender ?? '')
  const [language, setLanguage] = useState(existing?.language ?? i18n.language)
  const [error, setError] = useState(null) // i18n key
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const ageNum = Number(age)
    if (!name.trim()) return setError('profile.nameRequired')
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) return setError('profile.ageInvalid')
    if (!gender) return setError('profile.genderRequired')

    setBusy(true)
    try {
      await updateProfile({ name: name.trim(), age: ageNum, gender, language })
      setUiLanguage(language)
      if (isSetup) navigate('/home', { replace: true })
      else setSaved(true)
    } catch (err) {
      setError(`errors.${err.code ?? 'unknown'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="page-title">{isSetup ? t('profile.setupTitle') : t('profile.title')}</h1>
        <p className="mt-2 text-body-xl text-on-surface-variant">
          {isSetup ? t('profile.setupSubtitle') : user?.email}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <label className="block">
          <span className="mb-1 block text-body-lg font-semibold">{t('profile.name')}</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="block">
          <span className="mb-1 block text-body-lg font-semibold">{t('profile.age')}</span>
          <input
            className="input w-32"
            type="number"
            inputMode="numeric"
            min="1"
            max="120"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            required
          />
        </label>

        <ChoiceGroup legend={t('profile.gender')} name="gender" options={GENDERS} value={gender} onChange={setGender} />
        <ChoiceGroup legend={t('profile.language')} name="language" options={LANGUAGES} value={language} onChange={setLanguage} />

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-body-lg font-semibold text-error ring-1 ring-red-200">
            {t(error, { defaultValue: t('errors.unknown') })}
          </div>
        )}
        {saved && (
          <div role="status" className="rounded-xl bg-surface-container-low p-4 text-body-lg font-semibold text-primary ring-1 ring-primary-fixed">
            {t('profile.saved')}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('common.saving') : isSetup ? t('profile.continue') : t('profile.save')}
        </button>
      </form>
    </section>
  )
}
