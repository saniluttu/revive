import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import PlanStatus from '../reviews/PlanStatus.jsx'
import useReviews from '../reviews/useReviews.js'
import { latestReviewFor } from '../services/reviewService.js'
import VoiceAsk from '../voice/VoiceAsk.jsx'

const ACTIONS = [
  { to: '/session', title: 'home.startTitle', text: 'home.startText' },
  { to: '/exercises', title: 'home.chooseTitle', text: 'home.chooseText' },
  { to: '/report', title: 'home.reportTitle', text: 'home.reportText' },
  { to: '/progress', title: 'home.progressTitle', text: 'home.progressText' },
]

export default function PatientHome() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const name = user?.profile?.name
  const review = latestReviewFor(user.uid, useReviews())

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold sm:text-4xl">{name ? t('home.helloName', { name }) : t('home.hello')}</h1>
          <p className="mt-1 text-xl text-slate-600">{t('home.subtitle')}</p>
        </div>
        <Link to="/profile" className="btn-secondary px-4 py-2 text-base">
          {t('home.editProfile')}
        </Link>
      </div>

      {review && <PlanStatus review={review} />}

      <VoiceAsk />

      <div className="grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a, i) => (
          <Link
            key={a.to}
            to={a.to}
            className={`card block transition hover:-translate-y-0.5 hover:shadow-md ${
              i === 0 ? 'bg-brand-600 text-white ring-brand-600' : ''
            }`}
          >
            <div className="text-2xl font-bold">{t(a.title)}</div>
            <div className={`mt-1 text-lg ${i === 0 ? 'text-brand-50' : 'text-slate-600'}`}>{t(a.text)}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}
