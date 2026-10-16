// Joint-angle helpers for MediaPipe Pose landmarks (33-point model).

export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
}

export const VISIBILITY_THRESHOLD = 0.5

// Each joint angle is measured at the middle landmark: angle(a, b, c) at b.
export const JOINTS = [
  { key: 'leftShoulder', label: 'Left shoulder', points: [LM.LEFT_ELBOW, LM.LEFT_SHOULDER, LM.LEFT_HIP] },
  { key: 'rightShoulder', label: 'Right shoulder', points: [LM.RIGHT_ELBOW, LM.RIGHT_SHOULDER, LM.RIGHT_HIP] },
  { key: 'leftElbow', label: 'Left elbow', points: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST] },
  { key: 'rightElbow', label: 'Right elbow', points: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST] },
  { key: 'leftHip', label: 'Left hip', points: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE] },
  { key: 'rightHip', label: 'Right hip', points: [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE] },
  { key: 'leftKnee', label: 'Left knee', points: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE] },
  { key: 'rightKnee', label: 'Right knee', points: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE] },
]

// Landmarks that must be in frame for a "full body" view
const FULL_BODY = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
]

export function isVisible(lm) {
  return (
    lm != null &&
    (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD &&
    lm.x >= 0 &&
    lm.x <= 1 &&
    lm.y >= 0 &&
    lm.y <= 1
  )
}

/**
 * Angle in degrees (0–180) at point b formed by a-b-c.
 * Landmarks are normalised, so x/y are scaled by the frame size to avoid
 * distortion on non-square video.
 */
export function angleAt(a, b, c, width = 1, height = 1) {
  const v1x = (a.x - b.x) * width
  const v1y = (a.y - b.y) * height
  const v2x = (c.x - b.x) * width
  const v2y = (c.y - b.y) * height
  const dot = v1x * v2x + v1y * v2y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
  if (mag === 0) return null
  const cos = Math.min(1, Math.max(-1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Returns { [jointKey]: degrees | null } — null when a landmark isn't visible. */
export function computeJointAngles(landmarks, width, height) {
  const out = {}
  for (const j of JOINTS) {
    const [a, b, c] = j.points.map((i) => landmarks?.[i])
    out[j.key] = [a, b, c].every(isVisible) ? angleAt(a, b, c, width, height) : null
  }
  return out
}

/** Names of key landmarks that are missing / out of frame. */
export function missingKeyLandmarks(landmarks) {
  if (!landmarks) return ['body']
  return FULL_BODY.filter((i) => !isVisible(landmarks[i])).map(
    (i) => Object.keys(LM).find((k) => LM[k] === i),
  )
}
