// Numbers for the Progress view (patient Progress page, caregiver dashboard, PDF).
// Pure functions over session docs (see services/sessionService.js), newest first.

const DAY_MS = 24 * 60 * 60 * 1000

/** Local calendar day "2026-10-16" */
export function dayKey(dateLike) {
  const d = new Date(dateLike)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "16 Oct" in the UI language */
export function shortDay(date, lng) {
  return new Intl.DateTimeFormat(lng === 'ml' ? 'ml-IN' : 'en-IN', { day: 'numeric', month: 'short' }).format(new Date(date))
}

const avg = (values) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null)

/**
 * Days in a row with at least one session, ending today — or yesterday, so the
 * streak isn't "broken" before today's session.
 */
export function currentStreak(sessions, now = Date.now()) {
  const days = new Set(sessions.map((s) => dayKey(s.date)))
  let day = new Date(now)
  if (!days.has(dayKey(day))) day = new Date(now - DAY_MS)
  let streak = 0
  while (days.has(dayKey(day))) {
    streak++
    day = new Date(day.getTime() - DAY_MS)
  }
  return streak
}

/** Average pain after exercise: first 3 recorded sessions vs the latest 3. Null without 2+ readings. */
export function painChange(sessions) {
  const withPain = sessions.filter((s) => s.painAfter != null).reverse() // oldest first
  if (withPain.length < 2) return null
  const n = Math.min(3, Math.floor(withPain.length / 2))
  const from = avg(withPain.slice(0, n).map((s) => s.painAfter))
  const to = avg(withPain.slice(-n).map((s) => s.painAfter))
  return { from, to, change: to - from }
}

/** Reps per calendar day for the last `days` days, oldest first (days without a session = 0). */
export function repsPerDay(sessions, days = 14, now = Date.now()) {
  const totals = new Map()
  for (const s of sessions) totals.set(dayKey(s.date), (totals.get(dayKey(s.date)) ?? 0) + s.reps)
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * DAY_MS)
    return { day: dayKey(date), date, reps: totals.get(dayKey(date)) ?? 0 }
  })
}

/** Per exercise: sessions, reps, average quality and the most frequent wrong movement. */
export function perExercise(sessions) {
  const groups = new Map()
  for (const s of sessions) {
    const g = groups.get(s.exercise) ?? { exercise: s.exercise, sessions: 0, reps: 0, qualities: [], moves: {} }
    g.sessions++
    g.reps += s.reps
    g.qualities.push(s.quality)
    for (const [id, n] of Object.entries(s.wrongMoves ?? {})) g.moves[id] = (g.moves[id] ?? 0) + n
    groups.set(s.exercise, g)
  }
  return [...groups.values()]
    .map(({ qualities, moves, ...g }) => {
      const top = Object.entries(moves).sort((a, b) => b[1] - a[1])[0]
      return { ...g, quality: avg(qualities), topMistake: top ? { id: top[0], count: top[1] } : null }
    })
    .sort((a, b) => b.sessions - a.sessions)
}

/** Everything the summary cards show. */
export function summarize(sessions, now = Date.now()) {
  const weekAgo = now - 7 * DAY_MS
  return {
    sessionsThisWeek: sessions.filter((s) => new Date(s.date).getTime() >= weekAgo).length,
    totalReps: sessions.reduce((sum, s) => sum + s.reps, 0),
    avgQuality: avg(sessions.map((s) => s.quality)),
    streak: currentStreak(sessions, now),
    pain: painChange(sessions),
    doneToday: sessions.some((s) => dayKey(s.date) === dayKey(now)),
    lastSession: sessions[0] ?? null,
  }
}
