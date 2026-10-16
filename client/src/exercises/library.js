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

export const BODY_PARTS = [
  { id: 'shoulder', name: 'Shoulder', conditions: 'Frozen shoulder, rotator cuff', available: true },
  { id: 'knee', name: 'Knee', conditions: 'Osteoarthritis, after surgery', available: true },
  { id: 'lower-back', name: 'Lower back', conditions: 'Low back pain, disc issues', available: false },
  { id: 'neck', name: 'Neck', conditions: 'Cervical spondylosis', available: false },
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
    name: 'Shoulder abduction',
    difficulty: 'Easy',
    reps: 10,
    sets: 2,
    view: 'front',
    setup: 'Stand facing the camera with your arms by your sides.',
    steps: [
      'Raise your arms out to the sides, up to shoulder height',
      'Keep your elbows straight and shoulders relaxed',
      'Lower slowly back down',
    ],
    required: ['shoulder', 'elbow', 'hip'],
    // Hip–shoulder–elbow angle of the moving (higher) arm. The vertex is the live
    // shoulder: when a shrug lifts the shoulder and arm together the angle stays
    // the same, whereas a fixed calibrated vertex would read the lifted elbow as
    // extra abduction.
    metric: (f) => maxOf(f.sides.left.shoulderAngle, f.sides.right.shoulderAngle),
    metricLabel: 'Arm height',
    unit: '°',
    rest: 30,
    target: 85,
    ideal: 90,
    meter: [0, 120],
    rules: ['leanSideways', 'shrug'],
    mainFault: 'shrug',
    blockAtTarget: ['shrug'],
    cues: {
      start: 'Raise your arms out to the sides',
      up: 'Keep going — up to shoulder height',
      top: 'Good! Now lower slowly',
      down: 'Lower slowly',
      partial: 'Raise your arms a little higher',
    },
  },
  {
    id: 'shoulder-flexion',
    bodyPart: 'shoulder',
    name: 'Shoulder flexion',
    difficulty: 'Easy',
    reps: 10,
    sets: 2,
    view: 'side',
    setup: 'Stand side-on to the camera with your arms by your sides.',
    steps: [
      'Raise your arm forward and up, thumb pointing up',
      'Keep your back straight — do not lean back',
      'Lower slowly back down',
    ],
    required: ['shoulder', 'elbow', 'hip'],
    // Hip–shoulder–elbow angle of the moving (higher) arm. The vertex is the live
    // shoulder: when a shrug lifts the shoulder and arm together the angle stays
    // the same, whereas a fixed calibrated vertex would read the lifted elbow as
    // extra abduction.
    metric: (f) => maxOf(f.sides.left.shoulderAngle, f.sides.right.shoulderAngle),
    metricLabel: 'Arm height',
    unit: '°',
    rest: 30,
    target: 85,
    ideal: 110,
    meter: [0, 150],
    rules: ['shrug', 'backArch'],
    mainFault: 'backArch',
    cues: {
      start: 'Raise your arm forward',
      up: 'Keep going — reach forward and up',
      top: 'Good! Now lower slowly',
      down: 'Lower slowly',
      partial: 'Raise your arm a little higher',
    },
  },
  {
    id: 'mini-squat',
    bodyPart: 'knee',
    name: 'Mini squat',
    difficulty: 'Medium',
    reps: 10,
    sets: 2,
    view: 'front',
    setup: 'Stand facing the camera, feet hip-width apart. Hold a chair if needed.',
    steps: [
      'Bend your knees a little, as if starting to sit',
      'Keep your knees over your toes and chest up',
      'Stand back up slowly',
    ],
    required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: squatDepth,
    metricLabel: 'Squat depth',
    unit: '%',
    rest: 2.5,
    target: 5.5,
    ideal: 9,
    meter: [0, 12],
    rules: ['kneesIn', 'leanForward'],
    mainFault: 'kneesIn',
    cues: {
      start: 'Bend your knees slowly',
      up: 'A little lower',
      top: 'Good! Now stand up slowly',
      down: 'Stand up slowly',
      partial: 'Bend your knees a little more',
    },
  },
  {
    id: 'seated-knee-extension',
    bodyPart: 'knee',
    name: 'Seated knee extension',
    difficulty: 'Easy',
    reps: 10,
    sets: 2,
    view: 'side',
    setup: 'Sit on a chair side-on to the camera, feet on the floor.',
    steps: [
      'Straighten one knee, lifting your foot forward',
      'Hold for a moment with your back against the chair',
      'Lower your foot slowly',
    ],
    required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (f) => maxOf(f.sides.left.kneeAngle, f.sides.right.kneeAngle),
    metricLabel: 'Knee straightness',
    unit: '°',
    rest: 115,
    target: 145,
    ideal: 165,
    meter: [80, 180],
    rules: ['leanBack'],
    mainFault: 'leanBack',
    cues: {
      start: 'Straighten your knee',
      up: 'Keep straightening',
      top: 'Good! Now lower slowly',
      down: 'Lower your foot slowly',
      partial: 'Straighten your knee a little more',
    },
  },
]

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) ?? null
}

export function exercisesFor(bodyPartId) {
  return EXERCISES.filter((e) => e.bodyPart === bodyPartId)
}
