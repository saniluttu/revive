import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAuth from '../auth/useAuth.js'
import { ensureInviteCode, unlink } from '../services/linkService.js'
import { useLinks } from '../services/useLive.js'
import { Icon } from './ui.jsx'

/** Patient Home: the invite code for a caregiver, and who is linked (with Remove). */
export default function InviteCard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: links } = useLinks(user.uid, 'patient')
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(user.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(true)
    }
  }

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
    <div className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon name="family_restroom" className="text-4xl text-tertiary" />
          <div className="min-w-0">
            <h2 className="text-headline-md">{t('link.yourCode')}</h2>
            <p className="text-body-lg text-on-surface-variant">{t('link.codeHint')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-tertiary-fixed px-5 py-3 font-mono text-3xl font-extrabold tracking-[0.3em] text-tertiary">
            {user.inviteCode ?? '······'}
          </div>
          <button type="button" className="btn-tonal px-5 py-3" onClick={copy} disabled={!user.inviteCode}>
            <Icon name={copied ? 'check' : 'content_copy'} />
            <span aria-live="polite">{t(copied ? 'link.copied' : 'link.copy')}</span>
          </button>
        </div>
      </div>
      <div>
        <h3 className="text-label-lg">{t('link.caregivers')}</h3>
        {links?.length ? (
          <ul className="mt-2 space-y-2">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-body-lg">
                <span className="flex items-center gap-2">
                  <Icon name="person" className="text-primary" />
                  {l.caregiverName}
                </span>
                <button type="button" className="btn-secondary px-4 py-2 text-base" onClick={() => remove(l.id)}>
                  {t('link.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-body-lg text-on-surface-variant">{t('link.noCaregivers')}</p>
        )}
        {error && <p className="mt-2 text-body-lg font-semibold text-error">{t('errors.unknown')}</p>}
      </div>
    </div>
  )
}
