// Translatable messages for code that runs outside React (e.g. the rep counter).
//
// Such code returns `{ key, values }` instead of text, so the UI renders it in
// whatever language is active — and re-renders it if the language changes.
// A value can itself be a message, or an array of messages (joined as a list:
// "shoulders, elbows and hips").

/** @typedef {{ key: string, values?: Record<string, unknown> }} Message */

/** @returns {Message} */
export function msg(key, values) {
  return values ? { key, values } : { key }
}

const isMessage = (v) => v != null && typeof v === 'object' && typeof v.key === 'string'

/**
 * @param t    i18next `t` (from useTranslation or i18n.getFixedT)
 * @param m    Message
 * @param lng  language for list formatting
 */
export function translateMessage(t, m, lng = 'en') {
  if (!m) return ''
  const values = {}
  for (const [name, v] of Object.entries(m.values ?? {})) {
    if (Array.isArray(v)) {
      const items = v.map((x) => (isMessage(x) ? translateMessage(t, x, lng) : String(x)))
      values[name] = new Intl.ListFormat(lng, { type: 'conjunction' }).format(items)
    } else {
      values[name] = isMessage(v) ? translateMessage(t, v, lng) : v
    }
  }
  return t(m.key, values)
}
