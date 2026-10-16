import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { homePathFor, logOut, ROLES } from '../services/authService.js'

const NAV_BY_ROLE = {
  [ROLES.PATIENT]: [
    { to: '/home', label: 'Home' },
    { to: '/report', label: 'Report' },
    { to: '/exercises', label: 'Exercises' },
    { to: '/session', label: 'Live Session' },
    { to: '/progress', label: 'Progress' },
    { to: '/reminders', label: 'Reminders' },
    { to: '/chat', label: 'Chat' },
    { to: '/prescription', label: 'Prescription' },
  ],
  [ROLES.CAREGIVER]: [{ to: '/caregiver', label: 'Caregiver Dashboard' }],
}
const LOGGED_OUT_NAV = [{ to: '/login', label: 'Login' }]

// Full class strings so Tailwind can see them. The patient menu is long, so it
// collapses into the hamburger below xl; the short menus stay inline from sm.
const BREAKPOINT = {
  long: { desktop: 'hidden xl:flex', mobile: 'xl:hidden' },
  short: { desktop: 'hidden sm:flex', mobile: 'sm:hidden' },
}

const itemBase = 'block rounded-xl font-semibold transition'
const itemDesktop = 'px-2.5 py-1.5 text-base'
const itemMobile = 'px-4 py-3 text-lg'

function navClass(size) {
  return ({ isActive }) =>
    `${itemBase} ${size} ${isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'}`
}

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  )
}

export default function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const items = user ? (NAV_BY_ROLE[user.role] ?? []) : LOGGED_OUT_NAV
  const bp = items.length > 3 ? BREAKPOINT.long : BREAKPOINT.short

  async function handleLogout() {
    setOpen(false)
    await logOut()
    navigate('/login', { replace: true })
  }

  const renderItems = (size, onClick) => (
    <>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} className={navClass(size)} onClick={onClick}>
          {n.label}
        </NavLink>
      ))}
      {user && (
        <button type="button" onClick={handleLogout} className={`${itemBase} ${size} text-left text-red-700 hover:bg-red-50`}>
          Logout
        </button>
      )}
    </>
  )

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
          <Link to={homePathFor(user)} className="flex shrink-0 items-center gap-2" onClick={() => setOpen(false)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
              R
            </span>
            <span className="text-2xl font-bold text-brand-800">Revive</span>
          </Link>

          <nav className={`${bp.desktop} items-center gap-0.5`}>{renderItems(itemDesktop)}</nav>

          <button
            type="button"
            className={`${bp.mobile} rounded-xl p-2 text-slate-700 hover:bg-slate-100`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <MenuIcon open={open} />
          </button>
        </div>

        {open && (
          <nav id="mobile-nav" className={`${bp.mobile} grid gap-1 border-t border-slate-200 px-4 py-3`}>
            {renderItems(itemMobile, () => setOpen(false))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
