// Form / compensation rules (REQUIREMENTS.md §4 F6).
// check(features, baseline) → true (wrong movement), false (ok) or null (can't tell from this view).

export const RULES = {
  // Shoulder abduction: shoulder-hip line tilt > 10°
  leanSideways: {
    message: "Stand straight — don't lean sideways",
    check: (f) => (f.view === 'front' && f.trunk ? f.trunk.tilt > 10 : null),
  },

  // Shoulder abduction/flexion: shoulder-to-ear distance drops > 20% from baseline
  shrug: {
    message: "Relax your shoulders — don't shrug",
    check: (f, base) => {
      let seen = false
      for (const side of ['left', 'right']) {
        const now = f.earShoulder[side]
        const ref = base?.earShoulder?.[side]
        if (now == null || !ref) continue
        seen = true
        if (1 - now / ref > 0.2) return true
      }
      return seen ? false : null
    },
  },

  // Shoulder flexion: trunk leans back > 10° (side view)
  backArch: {
    message: "Don't arch your back — keep it straight",
    check: (f) => (f.trunk?.lean != null ? f.trunk.lean < -10 : null),
  },

  // Mini squat: knee gap < ankle gap (front view). Small margin for landmark noise.
  kneesIn: {
    message: 'Push your knees outward, over your toes',
    check: (f) => (f.view === 'front' && f.kneeGap != null && f.ankleGap ? f.kneeGap < f.ankleGap * 0.95 : null),
  },

  // Mini squat: trunk > 45° from vertical
  leanForward: {
    message: "Keep your chest up — don't lean forward",
    check: (f) => (f.trunk ? (f.trunk.lean ?? f.trunk.tilt) > 45 : null),
  },

  // Knee extension: trunk angle change > 15° (leaning back)
  leanBack: {
    message: "Sit upright — don't lean back",
    check: (f, base) => {
      if (!f.trunk) return null
      if (f.trunk.lean != null && base?.trunkLean != null) return base.trunkLean - f.trunk.lean > 15
      if (base?.trunkTilt != null) return Math.abs(f.trunk.tilt - base.trunkTilt) > 15
      return null
    },
  },
}
