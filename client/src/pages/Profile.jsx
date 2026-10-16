import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { updateProfile } from '../services/authService.js'

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
]

const LANGUAGES = [
  { value: 'ml', label: 'മലയാളം', hint: 'Malayalam' },
  { value: 'en', label: 'English', hint: 'English' },
]

function ChoiceGroup({ legend, name, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-lg font-semibold">{legend}</legend>
      <div className={`grid gap-3 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-2xl border-2 px-3 py-3 text-center transition ${
              value === o.value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
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
            <span className="block text-xl font-bold">{o.label}</span>
            {o.hint && o.hint !== o.label && <span className="block text-base text-slate-600">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const existing = user?.profile
  const isSetup = !existing

  const [name, setName] = useState(existing?.name ?? '')
  const [age, setAge] = useState(existing?.age?.toString() ?? '')
  const [gender, setGender] = useState(existing?.gender ?? '')
  const [language, setLanguage] = useState(existing?.language ?? 'ml')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const ageNum = Number(age)
    if (!name.trim()) return setError('Please enter your name.')
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) return setError('Please enter a valid age.')
    if (!gender) return setError('Please choose your gender.')

    setBusy(true)
    try {
      await updateProfile({ name: name.trim(), age: ageNum, gender, language })
      if (isSetup) navigate('/home', { replace: true })
      else setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{isSetup ? 'Set up your profile' : 'Your profile'}</h1>
        <p className="mt-2 text-xl text-slate-600">
          {isSetup ? 'Tell us a little about yourself to get started.' : user?.email}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <label className="block">
          <span className="mb-1 block text-lg font-semibold">Name</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="block">
          <span className="mb-1 block text-lg font-semibold">Age</span>
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

        <ChoiceGroup legend="Gender" name="gender" options={GENDERS} value={gender} onChange={setGender} />
        <ChoiceGroup legend="Preferred language" name="language" options={LANGUAGES} value={language} onChange={setLanguage} />

        {error && (
          <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {saved && (
          <div role="status" className="rounded-2xl bg-brand-50 p-4 text-lg font-semibold text-brand-800 ring-1 ring-brand-100">
            Profile saved.
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : isSetup ? 'Continue' : 'Save changes'}
        </button>
      </form>
    </section>
  )
}
