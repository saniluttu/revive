import { Link } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'

const ACTIONS = [
  { to: '/session', title: 'Start exercising', text: 'Live session with rep counting and form check' },
  { to: '/exercises', title: 'Choose exercises', text: 'Pick a body part and exercise' },
  { to: '/report', title: 'Upload report', text: 'Get exercise suggestions from your MRI report' },
  { to: '/progress', title: 'My progress', text: 'See how you are improving' },
]

export default function PatientHome() {
  const { user } = useAuth()
  const name = user?.profile?.name

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Hello{name ? `, ${name}` : ''}!</h1>
          <p className="mt-1 text-xl text-slate-600">What would you like to do today?</p>
        </div>
        <Link to="/profile" className="btn-secondary px-4 py-2 text-base">
          Edit profile
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a, i) => (
          <Link
            key={a.to}
            to={a.to}
            className={`card block transition hover:-translate-y-0.5 hover:shadow-md ${
              i === 0 ? 'bg-brand-600 text-white ring-brand-600' : ''
            }`}
          >
            <div className="text-2xl font-bold">{a.title}</div>
            <div className={`mt-1 text-lg ${i === 0 ? 'text-brand-50' : 'text-slate-600'}`}>{a.text}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}
