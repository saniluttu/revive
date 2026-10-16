import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import logOutAndReset from '../auth/logOutAndReset.js'
import useAuth from '../auth/useAuth.js'
import { homePathFor, logIn, ROLES, signUp } from '../services/authService.js'

const ROLE_OPTIONS = [
  { value: ROLES.PATIENT, label: 'login.patient', hint: 'login.patientHint' },
  { value: ROLES.CAREGIVER, label: 'login.caregiver', hint: 'login.caregiverHint' },
  { value: ROLES.PHYSIO, label: 'login.physio', hint: 'login.physioHint' },
]

const PHYSIO_FIELDS = [
  { name: 'name', label: 'login.physioName', autoComplete: 'name' },
  { name: 'registrationNumber', label: 'login.registrationNumber', autoComplete: 'off' },
  { name: 'clinic', label: 'login.clinic', autoComplete: 'organization' },
]

export default function Login() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.PATIENT)
  const [physio, setPhysio] = useState({ name: '', registrationNumber: '', clinic: '' })
  const [error, setError] = useState(null) // error code → errors.<code>
  const [busy, setBusy] = useState(false)

  // Already logged in (e.g. earlier in this tab): never jump straight into that person's
  // data from the login page, and show nothing about them here — just continue or log out.
  if (user && !busy) {
    return (
      <section className="mx-auto max-w-lg space-y-6">
        <div className="card space-y-4 text-center">
          <h1 className="text-3xl font-bold">{t('login.signedInTitle')}</h1>
          <p className="text-lg text-slate-600">{t('login.signedInText')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-primary" onClick={() => navigate(homePathFor(user), { replace: true })}>
              {t('login.continue')}
            </button>
            <button type="button" className="btn-secondary" onClick={logOutAndReset}>
              {t('login.logOutFirst')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const isSignup = mode === 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u = isSignup ? await signUp({ email, password, role, physio }) : await logIn({ email, password })
      navigate(homePathFor(u), { replace: true })
    } catch (err) {
      setError(err.code ?? 'unknown')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError(null)
  }

  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t('login.title')}</h1>
        <p className="mt-2 text-xl text-slate-600">{t('login.subtitle')}</p>
      </div>

      <div className="card space-y-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" role="tablist">
          {[
            ['login', t('login.loginTab')],
            ['signup', t('login.signupTab')],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={`rounded-xl py-3 text-lg font-semibold transition ${
                mode === value ? 'bg-white text-brand-700 shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignup && (
            <fieldset>
              <legend className="mb-2 text-lg font-semibold">{t('login.iAm')}</legend>
              <div className="grid gap-3">
                {ROLE_OPTIONS.map((r) => (
                  <label
                    key={r.value}
                    className={`cursor-pointer rounded-2xl border-2 px-4 py-3 transition ${
                      role === r.value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="sr-only"
                    />
                    <span className="block text-xl font-bold">{t(r.label)}</span>
                    <span className="block text-base text-slate-600">{t(r.hint)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {isSignup && role === ROLES.PHYSIO && (
            <div className="space-y-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              {PHYSIO_FIELDS.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-lg font-semibold">{t(f.label)}</span>
                  <input
                    className="input"
                    autoComplete={f.autoComplete}
                    value={physio[f.name]}
                    onChange={(e) => setPhysio((p) => ({ ...p, [f.name]: e.target.value }))}
                    required
                  />
                </label>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-lg font-semibold">{t('login.email')}</span>
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-lg font-semibold">{t('login.password')}</span>
            <input
              type="password"
              className="input"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {isSignup && <span className="mt-1 block text-base text-slate-500">{t('login.passwordHint')}</span>}
          </label>

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
              {t(`errors.${error}`, { defaultValue: t('errors.unknown') })}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.pleaseWait') : isSignup ? t('login.createAccount') : t('login.submit')}
          </button>
        </form>
      </div>
    </section>
  )
}
