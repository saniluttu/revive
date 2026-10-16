import { useTranslation } from 'react-i18next'
import useAuth from '../auth/useAuth.js'
import SessionHistory from '../components/SessionHistory.jsx'
import { useSessions } from '../services/useLive.js'

export default function Progress() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, loading, error } = useSessions(user.uid)
  return (
    <section className="space-y-6">
      <div>
        <h1 className="page-title">{t('pages.progress.title')}</h1>
        <p className="page-subtitle">{t('pages.progress.subtitle')}</p>
      </div>
      <SessionHistory sessions={data} loading={loading} error={error} />
    </section>
  )
}
