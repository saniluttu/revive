// Small shared building blocks: large, high-contrast, elderly-friendly.

import { toneText } from './tone.js'

/** A big number with a label (and an optional line under it). */
export function StatCard({ label, value, sub, tone = 'default' }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="text-base font-semibold text-slate-500 sm:text-lg">{label}</div>
      <div className={`mt-1 text-4xl font-extrabold tabular-nums sm:text-5xl ${toneText(tone)}`}>{value}</div>
      {sub && <div className="mt-1 text-base text-slate-500">{sub}</div>}
    </div>
  )
}

export function StatGrid({ children }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{children}</div>
}

/** A card with a heading. */
export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`card space-y-4 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-2xl font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return <p className="card text-lg text-slate-500">{children}</p>
}

export function ErrorNote({ children }) {
  return (
    <p role="alert" className="card text-lg font-semibold text-red-700">
      {children}
    </p>
  )
}
