// Lightweight SVG charts (no chart library): big labels, works in both languages.

const W = 640
const H = 220
const PAD = { l: 40, r: 12, t: 12, b: 30 }
const GRID = '#e2e8f0'
const AXIS_TEXT = '#64748b'

function Legend({ series }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-2">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="1" x2="25" y1="4" y2="4" stroke={s.color} strokeWidth="4" strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinecap="round" />
          </svg>
          {s.label}
        </span>
      ))}
    </div>
  )
}

function Grid({ y, ticks }) {
  return ticks.map((v) => (
    <g key={v}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} />
      <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="13" fill={AXIS_TEXT}>
        {v}
      </text>
    </g>
  ))
}

/**
 * @param points  [{ label, values: { [seriesKey]: number | null } }] oldest → newest
 * @param series  [{ key, label, color, dashed? }]
 * @param max     top of the y axis
 */
export function LineChart({ points, series, max, ariaLabel }) {
  if (points.length < 2) return null
  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1)
  const y = (v) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / max
  return (
    <figure className="space-y-2">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
        <Grid y={y} ticks={[0, max / 2, max]} />
        {series.map((s) => {
          const pts = points.map((p, i) => [x(i), p.values[s.key]]).filter(([, v]) => v != null)
          return (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '8 6' : undefined}
                points={pts.map(([px, v]) => `${px},${y(v)}`).join(' ')}
              />
              {pts.map(([px, v], i) => (
                <circle key={i} cx={px} cy={y(v)} r="4.5" fill={s.color} />
              ))}
            </g>
          )
        })}
        {[0, points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : 'end'} fontSize="13" fill={AXIS_TEXT}>
            {points[i].label}
          </text>
        ))}
      </svg>
    </figure>
  )
}

/** @param bars [{ label, value, shortLabel? }] oldest → newest */
export function BarChart({ bars, color = '#059669', ariaLabel }) {
  if (!bars.length) return null
  const max = Math.max(10, ...bars.map((b) => b.value))
  const slot = (W - PAD.l - PAD.r) / bars.length
  const y = (v) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / max
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      <Grid y={y} ticks={[0, Math.round(max / 2), max]} />
      {bars.map((b, i) => (
        <g key={i}>
          {b.value > 0 && (
            <rect x={PAD.l + i * slot + slot * 0.18} y={y(b.value)} width={slot * 0.64} height={y(0) - y(b.value)} rx="4" fill={color}>
              <title>{`${b.label}: ${b.value}`}</title>
            </rect>
          )}
          {(i === 0 || i === bars.length - 1 || i % 7 === bars.length % 7) && (
            <text x={PAD.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="13" fill={AXIS_TEXT}>
              {b.shortLabel ?? b.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
