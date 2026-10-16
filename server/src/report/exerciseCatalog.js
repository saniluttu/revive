// The exercises the report analysis may recommend. IDs must match
// client/src/exercises/library.js (a client test checks this).

export const BODY_PART_IDS = ['shoulder', 'knee', 'lower-back', 'neck']

export const EXERCISE_CATALOG = [
  {
    id: 'shoulder-abduction',
    bodyPart: 'shoulder',
    description: 'Standing, raise both arms out to the sides up to shoulder height (0–90°) and lower slowly.',
    suits: 'frozen shoulder (adhesive capsulitis), shoulder stiffness, mild rotator cuff tendinopathy',
  },
  {
    id: 'shoulder-flexion',
    bodyPart: 'shoulder',
    description: 'Standing side-on, raise one arm forward and up (to about 110°) and lower slowly.',
    suits: 'frozen shoulder, shoulder stiffness, recovery of overhead reach',
  },
  {
    id: 'mini-squat',
    bodyPart: 'knee',
    description: 'Standing, feet hip-width apart, bend the knees slightly (about 30–40°) and stand up; may hold a chair.',
    suits: 'mild–moderate knee osteoarthritis, quadriceps weakness; weight-bearing',
  },
  {
    id: 'seated-knee-extension',
    bodyPart: 'knee',
    description: 'Seated on a chair, straighten one knee by lifting the foot forward, hold, lower slowly.',
    suits: 'knee osteoarthritis, quadriceps strengthening, early rehab; non-weight-bearing',
  },
]

export const EXERCISE_IDS = EXERCISE_CATALOG.map((e) => e.id)
