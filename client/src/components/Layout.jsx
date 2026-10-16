import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/login', label: 'Login' },
  { to: '/profile', label: 'Profile' },
  { to: '/report', label: 'Report' },
  { to: '/exercises', label: 'Exercises' },
  { to: '/session', label: 'Live Session' },
  { to: '/summary', label: 'Summary' },
  { to: '/progress', label: 'Progress' },
  { to: '/reminders', label: 'Reminders' },
  { to: '/caregiver', label: 'Caregiver' },
  { to: '/chat', label: 'Chat' },
  { to: '/prescription', label: 'Prescription' },
]

function navClass(size) {
  return ({ isActive }) =>
    `block rounded-xl font-semibold transition ${size} ${
      isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'
    }`
}

export default function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
              R
            </span>
            <span className="text-2xl font-bold text-brand-800">Revive</span>
          </Link>
          <button
            className="btn-secondary px-4 py-2 xl:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <nav className="hidden gap-1 xl:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass('px-3 py-2 text-base')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {open && (
          <nav className="grid gap-1 border-t border-slate-200 px-4 py-3 xl:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass('px-4 py-3 text-lg')} onClick={() => setOpen(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
