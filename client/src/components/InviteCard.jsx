import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAuth from '../auth/useAuth.js'
import { ensureInviteCode, unlink } from '../services/linkService.js'
import { useLinks } from '../services/useLive.js'

/** Patient Home: the invite code for a caregiver, and who is linked (with Remove). */
export default function InviteCard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: links } = useLinks(user.uid, 'patient')
  const [error, setError] = useState(false)

  // Normally made with the profile; retried here if that failed
  useEffect(() => {
    if (!user.inviteCode) ensureInviteCode(user).catch(() => setError(true))
  }, [user])

  async function remove(id) {
    setError(false)
    try {
      await unlink(id)
    } catch {
      setError(true)
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">{t('link.yourCode')}</h2>
          <p className="text-lg text-slate-600">{t('link.codeHint')}</p>
        </div>
        <div className="rounded-2xl bg-brand-50 px-5 py-3 font-mono text-3xl font-extrabold tracking-[0.3em] text-brand-800 ring-1 ring-brand-100">
          {user.inviteCode ?? '······'}
        </div>
      </div>
      <div>
        <h3 className="text-xl font-bold">{t('link.caregivers')}</h3>
        {links?.length ? (
          <ul className="mt-2 space-y-2">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 text-lg">
                <span>{l.caregiverName}</span>
                <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={() => remove(l.id)}>
                  {t('link.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-lg text-slate-500">{t('link.noCaregivers')}</p>
        )}
        {error && <p className="mt-2 text-lg font-semibold text-red-700">{t('errors.unknown')}</p>}
      </div>
    </div>
  )
}
