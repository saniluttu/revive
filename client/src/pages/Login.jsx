import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { homePathFor, logIn, ROLES, signUp } from '../services/authService.js'

const ROLE_OPTIONS = [
  { value: ROLES.PATIENT, label: 'Patient', hint: 'I do the exercises' },
  { value: ROLES.CAREGIVER, label: 'Caregiver', hint: 'I watch over a family member' },
]

export default function Login() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.PATIENT)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user && !busy) return <Navigate to={homePathFor(user)} replace />

  const isSignup = mode === 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u = isSignup ? await signUp({ email, password, role }) : await logIn({ email, password })
      navigate(homePathFor(u), { replace: true })
    } catch (err) {
      setError(err.message)
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
        <h1 className="text-3xl font-bold sm:text-4xl">Welcome to Revive</h1>
        <p className="mt-2 text-xl text-slate-600">Your physiotherapist at home.</p>
      </div>

      <div className="card space-y-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" role="tablist">
          {[
            ['login', 'Log in'],
            ['signup', 'Sign up'],
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
              <legend className="mb-2 text-lg font-semibold">I am a…</legend>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_OPTIONS.map((r) => (
                  <label
                    key={r.value}
                    className={`cursor-pointer rounded-2xl border-2 p-4 transition ${
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
                    <span className="block text-xl font-bold">{r.label}</span>
                    <span className="block text-base text-slate-600">{r.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block">
            <span className="mb-1 block text-lg font-semibold">Email</span>
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
            <span className="mb-1 block text-lg font-semibold">Password</span>
            <input
              type="password"
              className="input"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {isSignup && <span className="mt-1 block text-base text-slate-500">At least 6 characters</span>}
          </label>

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 p-4 text-lg font-semibold text-red-800 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>
      </div>
    </section>
  )
}
