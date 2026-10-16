// Exercise library (REQUIREMENTS.md §4 F4). MVP: 2 shoulder + 2 knee exercises.
//
// Each exercise turns a frame into one number, `metric`, that rises as the
// patient moves from the start position towards the target:
//   rest   – at or below this the patient is back in the start position
//   target – must reach this for the rep to count
//   ideal  – full range-of-motion score
//   meter  – [min, max] for the on-screen range bar
//
// mainFault     – the exercise's main compensation; a rep where it is held for
//                 most of the rep is not counted
// blockAtTarget – faults that void the rep if active as the target is crossed

// Names, conditions, setup, steps, metric labels and cues are in i18n
// (`bodyParts.<id>`, `exercises.<id>`); difficulty is a key into `difficulty.*`.

export const BODY_PARTS = [
  { id: 'shoulder', available: true },
  { id: 'knee', available: true },
  { id: 'lower-back', available: false },
  { id: 'neck', available: false },
]

const maxOf = (...values) => {
  const v = values.filter((x) => x != null)
  return v.length ? Math.max(...v) : null
}
const avgOf = (...values) => {
  const v = values.filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/**
 * Squat depth as % drop in hip height. From the side the knee angle shows the
 * bend directly; from the front it is hidden, so we also use how far the hips
 * have dropped compared with standing (baseline). Knee flexion θ with equal
 * thigh/shin lengths drops the hips by 1 − cos(θ/2), so both convert to the
 * same scale: 5% ≈ 36° of knee bend.
 */
function squatDepth(f, base) {
  const knee = avgOf(f.sides.left.kneeAngle, f.sides.right.kneeAngle)
  const fromAngle = knee == null ? null : (1 - Math.cos(((180 - knee) * Math.PI) / 360)) * 100
  const fromHeight = base?.legHeight && f.legHeight != null ? (1 - f.legHeight / base.legHeight) * 100 : null
  return maxOf(fromAngle, fromHeight)
}

export const EXERCISES = [
  {
    id: 'shoulder-abduction',
    bodyPart: 'shoulder',
    difficulty: 'easy',
    reps: 10,
    sets: 2,
    view: 'front',
    required: ['shoulder', 'elbow', 'hip'],
    // Hip–shoulder–elbow angle of the moving (higher) arm. The vertex is the live
    // shoulder: when a shrug lifts the shoulder and arm together the angle stays
    // the same, whereas a fixed calibrated vertex would read the lifted elbow as
    // extra abduction.
    metric: (f) => maxOf(f.sides.left.shoulderAngle, f.sides.right.shoulderAngle),
    unit: '°',
    rest: 30,
    target: 85,
    ideal: 90,
    meter: [0, 120],
    rules: ['leanSideways', 'shrug'],
    mainFault: 'shrug',
    blockAtTarget: ['shrug'],
  },
  {
    id: 'shoulder-flexion',
    bodyPart: 'shoulder',
    difficulty: 'easy',
    reps: 10,
    sets: 2,
    view: 'side',
    required: ['shoulder', 'elbow', 'hip'],
    // Hip–shoulder–elbow angle of the moving (higher) arm. The vertex is the live
    // shoulder: when a shrug lifts the shoulder and arm together the angle stays
    // the same, whereas a fixed calibrated vertex would read the lifted elbow as
    // extra abduction.
    metric: (f) => maxOf(f.sides.left.shoulderAngle, f.sides.right.shoulderAngle),
    unit: '°',
    rest: 30,
    target: 85,
    ideal: 110,
    meter: [0, 150],
    rules: ['shrug', 'backArch'],
    mainFault: 'backArch',
  },
  {
    id: 'mini-squat',
    bodyPart: 'knee',
    difficulty: 'medium',
    reps: 10,
    sets: 2,
    view: 'front',
    required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: squatDepth,
    unit: '%',
    rest: 2.5,
    target: 5.5,
    ideal: 9,
    meter: [0, 12],
    rules: ['kneesIn', 'leanForward'],
    mainFault: 'kneesIn',
  },
  {
    id: 'seated-knee-extension',
    bodyPart: 'knee',
    difficulty: 'easy',
    reps: 10,
    sets: 2,
    view: 'side',
    required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (f) => maxOf(f.sides.left.kneeAngle, f.sides.right.kneeAngle),
    unit: '°',
    rest: 115,
    target: 145,
    ideal: 165,
    meter: [80, 180],
    rules: ['leanBack'],
    mainFault: 'leanBack',
  },
]

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) ?? null
}

export function exercisesFor(bodyPartId) {
  return EXERCISES.filter((e) => e.bodyPart === bodyPartId)
}
