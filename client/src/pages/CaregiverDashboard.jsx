import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAuth from '../auth/useAuth.js'
import SessionHistory from '../components/SessionHistory.jsx'
import { formatDate } from '../reviews/plan.js'
import { CODE_LENGTH, linkWithCode } from '../services/linkService.js'
import { useLinks, usePlan, useSessions } from '../services/useLive.js'

function LinkForm({ links }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [linkedName, setLinkedName] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setLinkedName(null)
    try {
      const link = await linkWithCode(user, code, links)
      setLinkedName(link.patientName)
      setCode('')
    } catch (err) {
      setError(err.code ?? 'unknown')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="text-2xl font-bold">{t('link.addPatient')}</h2>
      <p className="text-lg text-slate-600">{t('link.addPatientHint')}</p>
      <div className="flex flex-wrap gap-3">
        <input
          className="w-48 rounded-xl border-2 border-slate-300 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={CODE_LENGTH + 2}
          autoComplete="off"
          autoCapitalize="characters"
          aria-label={t('link.codeLabel')}
          placeholder="ABC234"
        />
        <button type="submit" className="btn-primary" disabled={busy || !code.trim()}>
          {busy ? t('common.pleaseWait') : t('link.linkButton')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-lg font-semibold text-red-700">
          {t(`link.errors.${error}`, { defaultValue: t('errors.unknown') })}
        </p>
      )}
      {linkedName != null && (
        <p role="status" className="text-lg font-semibold text-brand-700">
          {t('link.linked', { name: linkedName || t('link.patient') })}
        </p>
      )}
    </form>
  )
}

function PatientPanel({ link }) {
  const { t, i18n } = useTranslation()
  const sessions = useSessions(link.patientUid)
  const { data: plan } = usePlan(link.patientUid)
  const last = sessions.data?.[0]
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-3xl font-bold">{link.patientName || t('link.patient')}</h2>
        <p className="text-lg text-slate-600">
          {t('link.lastSession', { when: last ? formatDate(last.date, i18n.language) : t('link.never') })}
        </p>
      </div>
      <div className="card space-y-2">
        <h3 className="text-2xl font-bold">{t('link.plan')}</h3>
        {plan?.exercises?.length ? (
          <>
            <ul className="list-disc space-y-1 pl-6 text-lg">
              {plan.exercises.map((p) => (
                <li key={p.exerciseId}>
                  {t(`exercises.${p.exerciseId}.name`, { defaultValue: p.exerciseId })} —{' '}
                  {t('history.repsSets', { reps: p.reps, sets: p.sets })}
                </li>
              ))}
            </ul>
            {plan.notes && <p className="text-lg text-slate-600">{plan.notes}</p>}
          </>
        ) : (
          <p className="text-lg text-slate-500">{t('link.noPlan')}</p>
        )}
      </div>
      <SessionHistory sessions={sessions.data} loading={sessions.loading} error={sessions.error} />
    </section>
  )
}

export default function CaregiverDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: links, loading, error } = useLinks(user.uid, 'caregiver')
  const [selected, setSelected] = useState(null)
  const current = links?.find((l) => l.id === selected) ?? links?.[0]

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('pages.caregiver.title')}</h1>
        <p className="mt-1 text-xl text-slate-600">{t('pages.caregiver.subtitle')}</p>
      </div>

      {error && <p className="card text-lg font-semibold text-red-700">{t('history.error')}</p>}
      {loading && <p className="card text-lg text-slate-500">{t('common.pleaseWait')}</p>}

      {links?.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('link.patients')}>
          {links.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={l.id === current?.id}
              onClick={() => setSelected(l.id)}
              className={l.id === current?.id ? 'btn-primary' : 'btn-secondary'}
            >
              {l.patientName || t('link.patient')}
            </button>
          ))}
        </div>
      )}

      {current && <PatientPanel key={current.id} link={current} />}
      {links && !links.length && <p className="card text-lg text-slate-500">{t('link.noPatients')}</p>}

      <LinkForm links={links ?? []} />
    </section>
  )
}
