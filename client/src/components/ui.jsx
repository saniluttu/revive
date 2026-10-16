// Small shared building blocks: large, high-contrast, elderly-friendly.

import { toneText } from './tone.js'

/** Material Symbols Outlined icon (decorative). */
export function Icon({ name, fill = false, className = '' }) {
  return (
    <span className={`icon ${fill ? 'icon-fill' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

/** Page heading + subtitle. */
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** A big number with a label (and an optional line under it). */
export function StatCard({ label, value, sub, tone = 'default', icon }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-5 text-center shadow-soft ring-1 ring-outline-variant/40">
      <div className="flex items-center justify-center gap-1.5 text-label-lg text-on-surface-variant">
        {icon && <Icon name={icon} className="text-primary" />}
        {label}
      </div>
      <div className={`mt-1 text-4xl font-extrabold tabular-nums sm:text-5xl ${toneText(tone)}`}>{value}</div>
      {sub && <div className="mt-1 text-base text-on-surface-variant">{sub}</div>}
    </div>
  )
}

export function StatGrid({ children }) {
  return <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{children}</div>
}

/** A card with a heading. */
export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`card space-y-4 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-headline-md">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return <p className="card text-body-lg text-on-surface-variant">{children}</p>
}

export function ErrorNote({ children }) {
  return (
    <p role="alert" className="card text-body-lg font-semibold text-error">
      {children}
    </p>
  )
}
