// Form / compensation rules (REQUIREMENTS.md §4 F6).
// Messages are in i18n `rules.<id>`.
// check(features, baseline) → true (wrong movement), false (ok) or null (can't tell from this view).

import { ABDUCTION } from './library.js'

const workingSide = (f) => (f.working ? f.sides[f.working] : null)
const rad = (d) => (d * Math.PI) / 180

export const RULES = {
  // Shoulder abduction: shoulder-hip line tilt > 10°
  leanSideways: {
    check: (f) => (f.view === 'front' && f.trunk ? f.trunk.tilt > ABDUCTION.maxTrunkTilt : null),
  },

  // Shoulder abduction: hips and feet stay where they were at calibration (no dancing, stepping or swaying)
  standStill: {
    check: (f, base) => {
      if (!base?.shoulderWidth) return null
      const limit = ABDUCTION.maxBodyDrift * base.shoulderWidth
      const pairs = [
        [f.hipMid, base.hipMid],
        [f.sides.left.points.ankle, base.ankles?.left],
        [f.sides.right.points.ankle, base.ankles?.right],
      ].filter(([now, ref]) => now && ref)
      if (!pairs.length) return null
      return pairs.some(([now, ref]) => Math.hypot(now.x - ref.x, now.y - ref.y) > limit)
    },
  },

  // Shoulder abduction: the working arm's elbow must stay straight (> 150°)
  straightArm: {
    check: (f) => {
      const elbow = workingSide(f)?.elbowAngle
      return elbow == null ? null : elbow < ABDUCTION.minElbowAngle
    },
  },

  // Shoulder abduction: the arm moves out to the side, not forward. A forward swing
  // points the arm at the camera, so it looks shorter than at rest and the wrist
  // reaches out less than the angle implies.
  sideways: {
    check: (f, base) => {
      const side = workingSide(f)
      const ref = base?.armLength?.[f.working]
      if (!side || side.shoulderAngle == null || !ref) return null
      if (side.shoulderAngle < ABDUCTION.sidePlaneFrom) return false
      const { shoulder, wrist } = side.points
      const other = f.sides[f.working === 'left' ? 'right' : 'left'].points.shoulder
      if (!shoulder || !wrist || !other) return null
      const length = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y) / ref
      const outward = ((wrist.x - shoulder.x) * Math.sign(shoulder.x - other.x)) / ref
      const reach = ABDUCTION.minReach * Math.sin(rad(side.shoulderAngle))
      return length < ABDUCTION.minArmLength || outward < reach
    },
  },

  // Shoulder abduction/flexion: shoulder-to-ear distance drops > 20% from baseline
  shrug: {
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
    check: (f) => (f.trunk?.lean != null ? f.trunk.lean < -10 : null),
  },

  // Mini squat: knee gap < ankle gap (front view). Small margin for landmark noise.
  kneesIn: {
    check: (f) => (f.view === 'front' && f.kneeGap != null && f.ankleGap ? f.kneeGap < f.ankleGap * 0.95 : null),
  },

  // Mini squat: trunk > 45° from vertical
  leanForward: {
    check: (f) => (f.trunk ? (f.trunk.lean ?? f.trunk.tilt) > 45 : null),
  },

  // Knee extension: trunk angle change > 15° (leaning back)
  leanBack: {
    check: (f, base) => {
      if (!f.trunk) return null
      if (f.trunk.lean != null && base?.trunkLean != null) return base.trunkLean - f.trunk.lean > 15
      if (base?.trunkTilt != null) return Math.abs(f.trunk.tilt - base.trunkTilt) > 15
      return null
    },
  },
}
