// Colour for a value: quality 80+ good, 50+ warn, below bad.
const TONE = {
  default: 'text-slate-900',
  good: 'text-brand-700',
  warn: 'text-amber-600',
  bad: 'text-red-600',
}

export const qualityTone = (q) => (q == null ? 'default' : q >= 80 ? 'good' : q >= 50 ? 'warn' : 'bad')
export const toneText = (tone) => TONE[tone] ?? TONE.default
