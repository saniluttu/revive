// Per-frame body measurements used by the rep counter and form rules.
// All geometry is done in pixels (landmarks × frame size) so angles aren't
// distorted on non-square video. Image y grows downwards.

import { angleAt, isVisible, LM } from '../pose/angles.js'

const SIDES = {
  left: {
    ear: LM.LEFT_EAR,
    shoulder: LM.LEFT_SHOULDER,
    elbow: LM.LEFT_ELBOW,
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
  },
  right: {
    ear: LM.RIGHT_EAR,
    shoulder: LM.RIGHT_SHOULDER,
    elbow: LM.RIGHT_ELBOW,
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
  },
}

export const PART_LABELS = {
  shoulder: 'shoulders',
  elbow: 'elbows',
  hip: 'hips',
  knee: 'knees',
  ankle: 'feet',
}

// Shoulder width / torso length above this means the person faces the camera.
const FRONT_VIEW_RATIO = 0.45
// Nose this far ahead of the shoulders (in torso lengths) tells us which way a
// side-on person is facing, so we can tell leaning forward from leaning back.
const FACING_RATIO = 0.12

const deg = (rad) => (rad * 180) / Math.PI
const avg = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
})

/**
 * @returns {null | {
 *   visible: Record<string, boolean>,               // at least one side visible per body part
 *   sides: { left: SideData, right: SideData },     // SideData: { shoulderAngle, kneeAngle } (deg | null)
 *   trunk: null | { tilt: number, lean: number | null, length: number },
 *   view: 'front' | 'side',
 *   earShoulder: { left: number | null, right: number | null }, // vertical ear→shoulder gap / torso length
 *   legHeight: number | null,                       // vertical hip→ankle distance in px
 *   kneeGap: number | null, ankleGap: number | null // horizontal distance between the two knees / ankles in px
 * }}
 */
export function extractFeatures(landmarks, width, height) {
  if (!landmarks) return null
  const vis = (i) => isVisible(landmarks[i])
  const pt = (i) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height })
  const angle = (a, b, c) => (vis(a) && vis(b) && vis(c) ? angleAt(pt(a), pt(b), pt(c)) : null)
  const visiblePts = (part) =>
    Object.values(SIDES)
      .map((s) => s[part])
      .filter(vis)
      .map(pt)

  const visible = {}
  for (const part of Object.keys(PART_LABELS)) visible[part] = visiblePts(part).length > 0

  const sides = {}
  for (const [name, s] of Object.entries(SIDES)) {
    sides[name] = {
      shoulderAngle: angle(s.elbow, s.shoulder, s.hip),
      kneeAngle: angle(s.hip, s.knee, s.ankle),
    }
  }

  // Trunk = line from mid-hip to mid-shoulder
  let trunk = null
  let view = 'side'
  const shoulders = visiblePts('shoulder')
  const hips = visiblePts('hip')
  if (shoulders.length && hips.length) {
    const sh = avg(shoulders)
    const hp = avg(hips)
    const dx = sh.x - hp.x
    const up = hp.y - sh.y
    const length = Math.hypot(dx, up)
    if (length > 0) {
      let facing = null
      if (vis(LM.NOSE)) {
        const offset = (pt(LM.NOSE).x - sh.x) / length
        if (Math.abs(offset) > FACING_RATIO) facing = Math.sign(offset)
      }
      trunk = {
        tilt: deg(Math.atan2(Math.abs(dx), up)), // degrees from vertical, any direction
        lean: facing == null ? null : deg(Math.atan2(dx * facing, up)), // + forward, − backward
        length,
      }
      if (shoulders.length === 2 && Math.abs(shoulders[0].x - shoulders[1].x) / length > FRONT_VIEW_RATIO) {
        view = 'front'
      }
    }
  }

  const earShoulder = {}
  for (const [name, s] of Object.entries(SIDES)) {
    earShoulder[name] =
      trunk && vis(s.ear) && vis(s.shoulder) ? (pt(s.shoulder).y - pt(s.ear).y) / trunk.length : null
  }

  const ankles = visiblePts('ankle')
  const legHeight = hips.length && ankles.length ? avg(ankles).y - avg(hips).y : null

  const both = (part) => vis(SIDES.left[part]) && vis(SIDES.right[part])
  const gap = (part) => (both(part) ? Math.abs(pt(SIDES.left[part]).x - pt(SIDES.right[part]).x) : null)

  return {
    visible,
    sides,
    trunk,
    view,
    earShoulder,
    legHeight,
    kneeGap: gap('knee'),
    ankleGap: gap('ankle'),
  }
}
