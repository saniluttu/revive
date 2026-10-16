import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { motionFor } from '../avatar/motions.js'
import ExerciseImages from '../components/ExerciseImages.jsx'
import InviteCard from '../components/InviteCard.jsx'
import { dayKey, summarize } from '../components/progressStats.js'
import { Icon } from '../components/ui.jsx'
import i18n from '../i18n/index.js'
import { doctorName, planExercises, planSessionUrl } from '../reviews/plan.js'
import PlanStatus from '../reviews/PlanStatus.jsx'
import useReviews from '../reviews/useReviews.js'
import { latestReviewFor, REVIEW_STATUS } from '../services/reviewService.js'
import { useSessions } from '../services/useLive.js'
import { speak, stopSpeaking } from '../services/voiceService.js'
import VoiceAsk from '../voice/VoiceAsk.jsx'

const DAY_MS = 24 * 60 * 60 * 1000
const en = i18n.getFixedT('en')
const ml = i18n.getFixedT('ml')

const MORE = [
  { to: '/exercises', icon: 'fitness_center', title: 'home.chooseTitle', text: 'home.chooseText' },
  { to: '/report', icon: 'upload_file', title: 'home.reportTitle', text: 'home.reportText' },
  { to: '/progress', icon: 'monitoring', title: 'home.progressTitle', text: 'home.progressText' },
]

const greeting = (t, name) => (name ? t('home.helloName', { name }) : t('home.hello'))

/** Warm greeting in Malayalam and English, with the Malayalam read aloud on request. */
function GreetingBanner({ name }) {
  const { t } = useTranslation()
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => stopSpeaking, [])

  async function listen() {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    try {
      await speak(`${greeting(ml, name)} ${ml('home.subtitle')}`, 'ml')
    } finally {
      setSpeaking(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-tertiary-fixed via-surface-container-low to-primary-fixed/40 p-6 shadow-soft sm:p-8">
      <div className="min-w-0 space-y-1">
        <p lang="ml" className="text-headline-lg sm:text-display">
          {greeting(ml, name)}
        </p>
        <p lang="en" className="text-headline-md text-on-surface-variant">
          {greeting(en, name)}
        </p>
        <p className="pt-1 text-body-xl text-on-surface-variant">{t('home.subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={listen} aria-pressed={speaking}>
          <Icon name={speaking ? 'stop_circle' : 'volume_up'} />
          {speaking ? t('home.stopListening') : t('home.listenMl')}
        </button>
        <Link to="/profile" className="btn-secondary">
          <Icon name="person" />
          {t('home.editProfile')}
        </Link>
      </div>
    </div>
  )
}

/** Today's approved plan: who approved it, what it involves, and one big Start button. */
function PlanHero({ review }) {
  const { t, i18n: { language } } = useTranslation()
  const exercises = planExercises(review.plan)
  const totalReps = exercises.reduce((sum, e) => sum + e.reps * e.sets, 0)
  const chair = exercises.some((e) => motionFor(e.id)?.seated)
  const other = language === 'ml' ? en : ml

  return (
    <section className="relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-soft ring-1 ring-outline-variant/40">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-6 py-3 text-on-primary">
        <h2 className="text-headline-md">{t('home.todayPlan')}</h2>
        {review.reviewer?.name && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-on-primary/15 px-4 py-1.5 text-label-lg">
            <Icon name="verified" fill />
            {t('home.verifiedBy', { name: doctorName(t, review.reviewer.name) })}
          </span>
        )}
      </div>

      <div className="space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            <Icon name="fitness_center" className="text-primary" />
            {t('home.chipExercises', { count: exercises.length })}
          </span>
          <span className="chip">
            <Icon name="repeat" className="text-primary" />
            {t('home.chipReps', { count: totalReps })}
          </span>
          {chair && (
            <span className="chip">
              <Icon name="chair" className="text-primary" />
              {t('home.chipChair')}
            </span>
          )}
        </div>

        {review.reviewer?.clinic && <p className="text-body-lg text-on-surface-variant">{review.reviewer.clinic}</p>}
        {review.notes && <p className="rounded-xl bg-surface-container-low p-4 text-body-lg">{review.notes}</p>}

        <ul className="grid gap-4 md:grid-cols-2">
          {exercises.map((e) => (
            <li key={e.id}>
              <Link
                to={planSessionUrl(review.id, e.id)}
                className="flex h-full flex-col gap-3 rounded-xl bg-surface-container-low p-4 ring-1 ring-outline-variant/40 transition hover:ring-2 hover:ring-primary"
              >
                <ExerciseImages id={e.id} />
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-headline-md">{t(`exercises.${e.id}.name`)}</span>
                    <span className="block text-body-lg text-on-surface-variant">{t('review.repsSets', { reps: e.reps, sets: e.sets })}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-label-lg text-primary">
                    {t('review.start')}
                    <Icon name="arrow_forward" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {exercises[0] && (
          <Link
            to={planSessionUrl(review.id, exercises[0].id)}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-full bg-primary px-8 py-6 text-center text-on-primary shadow-soft transition hover:bg-primary-container sm:flex-row sm:gap-3"
          >
            <Icon name="play_circle" fill className="text-4xl" />
            <span className="text-headline-md sm:text-headline-lg">{t('home.startSession')}</span>
            <span lang={language === 'ml' ? 'en' : 'ml'} className="text-body-xl opacity-90">
              ({other('home.startSession')})
            </span>
          </Link>
        )}
      </div>
    </section>
  )
}

function StatTile({ icon, label, children }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-label-lg text-on-surface-variant">
        <Icon name={icon} className="text-primary" />
        {label}
      </div>
      {children}
    </div>
  )
}

/** Streak (with a dot per day), sessions this week (with a bar), average quality. */
function Stats({ uid }) {
  const { t } = useTranslation()
  const { data: sessions } = useSessions(uid)
  const [now] = useState(() => Date.now())
  if (!sessions) return null
  const stats = summarize(sessions, now)
  const days = new Set(sessions.map((s) => dayKey(s.date)))
  const week = Array.from({ length: 7 }, (_, i) => days.has(dayKey(now - (6 - i) * DAY_MS)))
  const activeDays = week.filter(Boolean).length

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatTile icon="local_fire_department" label={t('home.streak')}>
        <div className="text-display tabular-nums">{t('home.streakDays', { count: stats.streak })}</div>
        <div className="flex gap-2" role="img" aria-label={t('home.streakDots', { n: activeDays })}>
          {week.map((done, i) => (
            <span key={i} className={`h-4 w-4 rounded-full ${done ? 'bg-secondary' : 'bg-surface-container-high'}`} />
          ))}
        </div>
      </StatTile>
      <StatTile icon="event_available" label={t('home.weekSessions')}>
        <div className="text-display tabular-nums">{stats.sessionsThisWeek}</div>
        <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(activeDays / 7) * 100}%` }} />
        </div>
        <p className="text-base text-on-surface-variant">{t('home.weekDays', { n: activeDays })}</p>
      </StatTile>
      <StatTile icon="star" label={t('home.avgQuality')}>
        {stats.avgQuality == null ? (
          <p className="text-body-xl text-on-surface-variant">{t('home.noSessions')}</p>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-display tabular-nums">{stats.avgQuality}</span>
            <span className="text-body-lg text-on-surface-variant">{t('home.outOf100')}</span>
          </div>
        )}
      </StatTile>
    </div>
  )
}

export default function PatientHome() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const review = latestReviewFor(user.uid, useReviews())
  const approved = review?.status === REVIEW_STATUS.APPROVED

  return (
    <section className="space-y-6 pb-24">
      <GreetingBanner name={user?.profile?.name} />

      {approved ? <PlanHero review={review} /> : review && <PlanStatus review={review} />}

      <Stats uid={user.uid} />

      <VoiceAsk />

      <InviteCard />

      <div className="space-y-3">
        <h2 className="text-headline-md">{t('home.more')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {!approved && (
            <Link to="/session" className="card flex items-start gap-4 bg-primary text-on-primary ring-primary transition hover:bg-primary-container md:col-span-3">
              <Icon name="play_circle" fill className="text-4xl" />
              <span>
                <span className="block text-headline-md">{t('home.startTitle')}</span>
                <span className="block text-body-lg opacity-90">{t('home.startText')}</span>
              </span>
            </Link>
          )}
          {MORE.map((a) => (
            <Link key={a.to} to={a.to} className="card flex items-start gap-4 transition hover:ring-2 hover:ring-primary">
              <Icon name={a.icon} className="text-4xl text-primary" />
              <span>
                <span className="block text-headline-md">{t(a.title)}</span>
                <span className="block text-body-lg text-on-surface-variant">{t(a.text)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Link
        to="/chat"
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-4 text-label-lg text-white shadow-lg ring-4 ring-white transition hover:bg-primary"
      >
        <Icon name="mic" fill />
        {t('home.askRevive')}
      </Link>
    </section>
  )
}
