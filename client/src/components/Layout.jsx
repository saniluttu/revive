import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router-dom'
import useAuth from '../auth/useAuth.js'
import { applyProfileLanguage } from '../i18n/index.js'
import logOutAndReset from '../auth/logOutAndReset.js'
import { homePathFor, ROLES } from '../services/authService.js'
import LanguageToggle from './LanguageToggle.jsx'
import { Icon } from './ui.jsx'

const NAV_BY_ROLE = {
  [ROLES.PATIENT]: [
    { to: '/home', label: 'nav.home' },
    { to: '/report', label: 'nav.report' },
    { to: '/exercises', label: 'nav.exercises' },
    { to: '/session', label: 'nav.session' },
    { to: '/progress', label: 'nav.progress' },
    { to: '/chat', label: 'nav.chat' },
    // /reminders and /prescription still have routes but are hidden for the demo (parked)
  ],
  [ROLES.CAREGIVER]: [{ to: '/caregiver', label: 'nav.caregiver' }],
  [ROLES.PHYSIO]: [{ to: '/reviews', label: 'nav.reviews' }],
}
const LOGGED_OUT_NAV = [{ to: '/login', label: 'nav.login' }]

// Full class strings so Tailwind can see them. The pill nav has its own row
// under the header from lg (xl for the long patient menu in Malayalam, whose
// labels are wider); below that it is in the hamburger menu.
const BREAKPOINT = {
  en: {
    long: { desktop: 'hidden lg:flex', mobile: 'lg:hidden' },
    short: { desktop: 'hidden md:flex', mobile: 'md:hidden' },
  },
  ml: {
    long: { desktop: 'hidden xl:flex', mobile: 'xl:hidden' },
    short: { desktop: 'hidden md:flex', mobile: 'md:hidden' },
  },
}

const itemBase = 'block whitespace-nowrap rounded-full font-semibold transition'
const itemDesktop = 'px-3.5 py-2 text-base'
const itemMobile = 'px-5 py-3 text-body-lg'

function navClass(size) {
  return ({ isActive }) =>
    `${itemBase} ${size} ${isActive ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`
}

const initials = (name) =>
  String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

/** The signed-in user's initials in a circle, with their name on wider screens. */
function UserBadge({ user }) {
  const { t } = useTranslation()
  const name = user.profile?.name || user.email || ''
  return (
    <span className="hidden shrink-0 items-center gap-2 sm:flex" title={t('nav.account', { name })}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-base font-bold text-primary" aria-hidden="true">
        {initials(name) || <Icon name="person" />}
      </span>
      <span className="hidden max-w-[10rem] truncate text-base font-semibold xl:inline">{name}</span>
      <span className="sr-only">{t('nav.account', { name })}</span>
    </span>
  )
}

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
    </svg>
  )
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  const profileLanguage = user?.profile?.language
  useEffect(() => {
    applyProfileLanguage(profileLanguage)
  }, [profileLanguage])

  const items = user ? (NAV_BY_ROLE[user.role] ?? []) : LOGGED_OUT_NAV
  const bp = (BREAKPOINT[i18n.language] ?? BREAKPOINT.en)[items.length > 3 ? 'long' : 'short']

  function handleLogout() {
    setOpen(false)
    logOutAndReset()
  }

  const renderItems = (size, onClick) => (
    <>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} className={navClass(size)} onClick={onClick}>
          {t(n.label)}
        </NavLink>
      ))}
    </>
  )

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-outline-variant/50 bg-white/95 shadow-soft backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5">
          <Link to={homePathFor(user)} className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xl font-bold text-on-primary sm:h-11 sm:w-11">
              {t('app.logo')}
            </span>
            <span className="hidden leading-tight min-[400px]:block">
              <span className="block text-2xl font-extrabold text-primary">{t('app.name')}</span>
              <span lang="ml" className="block text-sm text-on-surface-variant">
                {t('app.tagline')}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageToggle />

            <a
              href="tel:108"
              aria-label={t('nav.emergencyLabel')}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-error p-1.5 text-base font-bold text-white shadow-soft transition hover:bg-red-800 sm:px-4"
            >
              <Icon name="call" fill />
              <span className="hidden sm:inline">{t('nav.emergency')}</span>
            </a>

            {user && <UserBadge user={user} />}

            {/* Always visible (not inside the menu), so it's easy to hand the device over */}
            {user && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label={t('nav.logout')}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-outline-variant p-1.5 text-base font-semibold text-on-surface-variant transition hover:bg-surface-container-low sm:px-3 sm:py-1.5"
              >
                <LogoutIcon />
                <span className="hidden xl:inline">{t('nav.logout')}</span>
              </button>
            )}

            <button
              type="button"
              className={`${bp.mobile} rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-low`}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <div className={`${bp.desktop} mx-auto max-w-7xl px-4 pb-2.5`}>
            <nav className="flex items-center gap-1 rounded-full bg-surface-container-low p-1">{renderItems(itemDesktop)}</nav>
          </div>
        )}

        {open && (
          <nav id="mobile-nav" className={`${bp.mobile} grid gap-1 border-t border-outline-variant/50 px-4 py-3`}>
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
