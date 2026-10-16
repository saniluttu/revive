import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAuth from '../auth/useAuth.js'
import SessionHistory from '../components/SessionHistory.jsx'
import { summarize } from '../components/progressStats.js'
import { Empty, ErrorNote, Icon, Section } from '../components/ui.jsx'
import i18n from '../i18n/index.js'
import { formatDate } from '../reviews/plan.js'
import { CODE_LENGTH, getPatientProfile, getPatientRecord, linkWithCode, RELATIONS } from '../services/linkService.js'
import { useLinks, usePlan, useSessions } from '../services/useLive.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Big tappable relation chips, each labelled in the UI language with the other language under it. */
function RelationChips({ value, onChange }) {
  const { t, i18n: { language } } = useTranslation()
  const other = i18n.getFixedT(language === 'ml' ? 'en' : 'ml')
  return (
    <fieldset>
      <legend className="mb-2 text-label-lg">{t('link.relationLabel')}</legend>
      <div className="flex flex-wrap gap-2">
        {RELATIONS.map((id) => {
          const on = value === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(id)}
              className={`flex min-h-[3.5rem] flex-col items-center justify-center rounded-full px-5 py-2 leading-tight ring-2 transition ${
                on ? 'bg-primary text-on-primary ring-primary' : 'bg-surface-container-lowest text-on-surface ring-outline-variant hover:ring-primary'
              }`}
            >
              <span className="text-label-lg">{t(`link.relations.${id}`)}</span>
              <span lang={language === 'ml' ? 'en' : 'ml'} className={`text-sm ${on ? 'opacity-90' : 'text-on-surface-variant'}`}>
                {other(`link.relations.${id}`)}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function LinkForm({ links }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [relation, setRelation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [linkedName, setLinkedName] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setLinkedName(null)
    try {
      const link = await linkWithCode(user, code, links, relation)
      setLinkedName(link.patientName)
      setCode('')
      setRelation(null)
    } catch (err) {
      setError(err.code ?? 'unknown')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="flex items-center gap-2 text-headline-md">
        <Icon name="person_add" className="text-primary" />
        {t(links.length ? 'link.addAnother' : 'link.addPatient')}
      </h2>
      <p className="text-body-lg text-on-surface-variant">{t('link.addPatientHint')}</p>
      <div className="flex flex-wrap gap-3">
        <input
          className="w-48 rounded-xl border-2 border-outline-variant px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={CODE_LENGTH + 2}
          autoComplete="off"
          autoCapitalize="characters"
          aria-label={t('link.codeLabel')}
          placeholder="ABC234"
        />
      </div>
      <RelationChips value={relation} onChange={setRelation} />
      <button type="submit" className="btn-primary" disabled={busy || !code.trim() || !relation}>
        {busy ? t('common.pleaseWait') : t('link.linkButton')}
      </button>
      {error && (
        <p role="alert" className="text-body-lg font-semibold text-error">
          {t(`link.errors.${error}`, { defaultValue: t('errors.unknown') })}
        </p>
      )}
      {linkedName != null && (
        <p role="status" className="text-body-lg font-semibold text-primary">
          {t('link.linked', { name: linkedName || t('link.patient') })}
        </p>
      )}
    </form>
  )
}

/** One linked patient at a glance: today's status, last session, 24 h alert. */
function PatientCard({ link, selected, onSelect }) {
  const { t, i18n } = useTranslation()
  const [gender, setGender] = useState(null)
  useEffect(() => {
    let alive = true
    getPatientProfile(link.patientUid)
      .then((p) => alive && setGender(p?.gender ?? null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [link.patientUid])
  const relation = link.relation && t(`link.relations.${link.relation}`)
  const { data: sessions, loading } = useSessions(link.patientUid)
  const [now] = useState(() => Date.now())
  const stats = sessions ? summarize(sessions, now) : null
  const last = stats?.lastSession
  const quiet = stats && (!last || now - new Date(last.date).getTime() > DAY_MS)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card space-y-2 text-left transition ${selected ? 'ring-4 ring-primary' : 'hover:ring-primary'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-headline-md">{link.patientName || t('link.patient')}</span>
          {relation && (
            <span className="block text-body-lg text-on-surface-variant">
              {t('link.youAre', { context: gender, relation: i18n.language === 'en' ? relation.toLowerCase() : relation })}
            </span>
          )}
        </span>
        {stats && (
          <span className={`rounded-full px-3 py-1 text-base font-bold ${stats.doneToday ? 'bg-primary-fixed/50 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
            {t(stats.doneToday ? 'caregiver.doneToday' : 'caregiver.notDoneToday')}
          </span>
        )}
      </div>
      <div className="text-body-lg text-on-surface-variant">
        {loading ? t('common.pleaseWait') : t('link.lastSession', { when: last ? formatDate(last.date, i18n.language) : t('link.never') })}
      </div>
      {quiet && (
        <div role="alert" className="rounded-xl bg-amber-100 px-4 py-2 text-body-lg font-semibold text-amber-950">
          ⚠ {t(last ? 'caregiver.noSession24h' : 'caregiver.noSessionYet')}
        </div>
      )}
    </button>
  )
}

function DownloadReport({ link, plan, sessions }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function download() {
    setBusy(true)
    setError(false)
    try {
      const [{ user, report }, { buildPatientReport, reportFileName }] = await Promise.all([
        getPatientRecord(link.patientUid),
        import('../reports/patientReportPdf.js'),
      ])
      const patient = { name: user?.profile?.name ?? link.patientName, age: user?.profile?.age, gender: user?.profile?.gender }
      const pdf = await buildPatientReport({ patient, report, plan, sessions: sessions ?? [] })
      pdf.save(reportFileName(patient.name))
    } catch (err) {
      console.warn('[pdf]', err)
      setError(true)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" className="btn-primary" onClick={download} disabled={busy || !sessions}>
        {busy ? t('caregiver.preparing') : `⬇ ${t('caregiver.downloadPdf')}`}
      </button>
      <span className="text-base text-on-surface-variant">{t('caregiver.pdfHint')}</span>
      {error && <span className="text-body-lg font-semibold text-error">{t('caregiver.pdfFailed')}</span>}
    </div>
  )
}

function PatientPanel({ link }) {
  const { t } = useTranslation()
  const sessions = useSessions(link.patientUid)
  const { data: plan } = usePlan(link.patientUid)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-3xl font-bold">{link.patientName || t('link.patient')}</h2>
        <DownloadReport link={link} plan={plan} sessions={sessions.data} />
      </div>
      <Section title={t('link.plan')}>
        {plan?.exercises?.length ? (
          <>
            <ul className="list-disc space-y-1 pl-6 text-body-lg">
              {plan.exercises.map((p) => (
                <li key={p.exerciseId}>
                  {t(`exercises.${p.exerciseId}.name`, { defaultValue: p.exerciseId })} — {t('history.repsSets', { reps: p.reps, sets: p.sets })}
                </li>
              ))}
            </ul>
            {plan.notes && <p className="text-body-lg text-on-surface-variant">{plan.notes}</p>}
          </>
        ) : (
          <p className="text-body-lg text-on-surface-variant">{t('link.noPlan')}</p>
        )}
      </Section>
      <SessionHistory sessions={sessions.data} loading={sessions.loading} error={sessions.error} />
    </div>
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
        <h1 className="page-title">{t('pages.caregiver.title')}</h1>
        <p className="page-subtitle">{t('pages.caregiver.subtitle')}</p>
      </div>

      {error && <ErrorNote>{t('history.error')}</ErrorNote>}
      {loading && <Empty>{t('common.pleaseWait')}</Empty>}
      {links && !links.length && <Empty>{t('link.noPatients')}</Empty>}

      {links?.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {links.map((l) => (
            <PatientCard key={l.id} link={l} selected={l.id === current?.id} onSelect={() => setSelected(l.id)} />
          ))}
        </div>
      )}

      {/* Always visible, so a second patient (e.g. both parents) can be added at any time */}
      {links && <LinkForm links={links} />}

      {current && <PatientPanel key={current.id} link={current} />}
    </section>
  )
}
