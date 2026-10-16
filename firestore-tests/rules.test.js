// firestore.rules against the Firestore emulator. Run: cd firestore-tests && npm test (needs Java).
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, setLogLevel, updateDoc, where, writeBatch } from 'firebase/firestore'

const PATIENT = 'patient1'
const OTHER_PATIENT = 'patient2'
const CAREGIVER = 'caregiver1'
const STRANGER = 'caregiver2'
const PHYSIO = 'physio1'
const CODE = 'ABC234'

setLogLevel('silent') // denied writes are expected here; don't log each one

let env
const as = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-revive',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(() => env.cleanup())

const pendingReview = {
  reportId: 'report1',
  status: 'pending',
  patientUid: PATIENT,
  patient: { uid: PATIENT, name: 'Lakshmi', age: 68 },
  aiPlan: [{ exerciseId: 'mini-squat', reps: 10, sets: 2 }],
  plan: null,
  notes: '',
  rejectReason: '',
  reviewer: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  reviewedAt: null,
}

// Every test starts from the same data, written with rules off
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', PATIENT), { role: 'patient', email: 'amma@x.in', profile: { name: 'Lakshmi' }, inviteCode: CODE })
    await setDoc(doc(db, 'users', OTHER_PATIENT), { role: 'patient', email: 'b@x.in', profile: { name: 'Mary' } })
    await setDoc(doc(db, 'users', CAREGIVER), { role: 'caregiver', email: 'son@x.in', profile: null })
    await setDoc(doc(db, 'users', STRANGER), { role: 'caregiver', email: 'x@x.in', profile: null })
    await setDoc(doc(db, 'users', PHYSIO), { role: 'physiotherapist', email: 'dr@x.in', profile: { name: 'Anitha' } })
    await setDoc(doc(db, 'inviteCodes', CODE), { patientUid: PATIENT, patientName: 'Lakshmi' })
    await setDoc(doc(db, 'links', `${CAREGIVER}_${PATIENT}`), {
      patientUid: PATIENT,
      caregiverUid: CAREGIVER,
      code: CODE,
      status: 'accepted',
      createdAt: '2026-10-10T10:00:00.000Z',
    })
    await setDoc(doc(db, 'sessions', 's1'), { patientUid: PATIENT, exercise: 'mini-squat', quality: 80, date: '2026-10-11' })
    await setDoc(doc(db, 'sessions', 's2'), { patientUid: OTHER_PATIENT, exercise: 'mini-squat', quality: 70, date: '2026-10-11' })
    await setDoc(doc(db, 'reports', 'report1'), { patientUid: PATIENT, reviewRequested: true, analysis: {} })
    await setDoc(doc(db, 'reports', 'report2'), { patientUid: PATIENT, reviewRequested: false, analysis: {} })
    await setDoc(doc(db, 'reviews', 'review1'), pendingReview)
    await setDoc(doc(db, 'plans', PATIENT), { patientUid: PATIENT, reviewId: 'old', exercises: [] })
  })
})

describe('users', () => {
  test('own doc: read and write; role cannot change', async () => {
    await assertSucceeds(getDoc(doc(as(PATIENT), 'users', PATIENT)))
    await assertSucceeds(setDoc(doc(as(PATIENT), 'users', PATIENT), { profile: { name: 'Amma' } }, { merge: true }))
    await assertFails(setDoc(doc(as(PATIENT), 'users', PATIENT), { role: 'physiotherapist' }, { merge: true }))
  })

  test('signup creates own doc with a valid role only', async () => {
    await assertSucceeds(setDoc(doc(as('new1'), 'users', 'new1'), { role: 'patient', email: 'n@x.in' }))
    await assertFails(setDoc(doc(as('new2'), 'users', 'new2'), { role: 'admin', email: 'n@x.in' }))
    await assertFails(setDoc(doc(as('new3'), 'users', 'someoneElse'), { role: 'patient' }))
  })

  test('a linked caregiver can read the patient; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as(CAREGIVER), 'users', PATIENT)))
    await assertFails(getDoc(doc(as(CAREGIVER), 'users', OTHER_PATIENT)))
    await assertFails(getDoc(doc(as(STRANGER), 'users', PATIENT)))
    await assertFails(getDoc(doc(as(PHYSIO), 'users', PATIENT)))
    await assertFails(getDoc(doc(anon(), 'users', PATIENT)))
    await assertFails(setDoc(doc(as(CAREGIVER), 'users', PATIENT), { profile: {} }, { merge: true }))
  })
})

describe('invite codes and links', () => {
  test('a code can be read by exact id but not listed', async () => {
    await assertSucceeds(getDoc(doc(as(STRANGER), 'inviteCodes', CODE)))
    await assertFails(getDocs(collection(as(STRANGER), 'inviteCodes')))
  })

  test('a patient creates a code for themselves; an existing code cannot be taken over', async () => {
    await assertSucceeds(setDoc(doc(as(OTHER_PATIENT), 'inviteCodes', 'XYZ789'), { patientUid: OTHER_PATIENT }))
    await assertFails(setDoc(doc(as(OTHER_PATIENT), 'inviteCodes', CODE), { patientUid: OTHER_PATIENT }))
    await assertFails(setDoc(doc(as(CAREGIVER), 'inviteCodes', 'QQQ222'), { patientUid: CAREGIVER }))
  })

  test('a caregiver links with the right code only', async () => {
    const link = { patientUid: PATIENT, caregiverUid: STRANGER, code: CODE, status: 'accepted' }
    await assertSucceeds(setDoc(doc(as(STRANGER), 'links', `${STRANGER}_${PATIENT}`), link))
    // wrong code for that patient
    await assertFails(
      setDoc(doc(as(STRANGER), 'links', `${STRANGER}_${OTHER_PATIENT}`), { ...link, patientUid: OTHER_PATIENT }),
    )
    // in someone else's name
    await assertFails(setDoc(doc(as(STRANGER), 'links', `${CAREGIVER}_${PATIENT}`), { ...link, caregiverUid: CAREGIVER }))
    // patients and physios can't make links
    await assertFails(
      setDoc(doc(as(PHYSIO), 'links', `${PHYSIO}_${PATIENT}`), { ...link, caregiverUid: PHYSIO }),
    )
  })

  test('an existing link cannot be overwritten; either side can remove it', async () => {
    const id = `${CAREGIVER}_${PATIENT}`
    await assertFails(setDoc(doc(as(CAREGIVER), 'links', id), { patientUid: PATIENT, caregiverUid: CAREGIVER, code: CODE, status: 'accepted' }))
    await assertFails(deleteDoc(doc(as(STRANGER), 'links', id)))
    await assertSucceeds(deleteDoc(doc(as(PATIENT), 'links', id)))
  })

  test('each side lists its own links', async () => {
    await assertSucceeds(getDocs(query(collection(as(CAREGIVER), 'links'), where('caregiverUid', '==', CAREGIVER))))
    await assertSucceeds(getDocs(query(collection(as(PATIENT), 'links'), where('patientUid', '==', PATIENT))))
    await assertFails(getDocs(collection(as(CAREGIVER), 'links')))
  })
})

describe('sessions', () => {
  test('patient writes and reads own sessions only', async () => {
    await assertSucceeds(setDoc(doc(as(PATIENT), 'sessions', 'new'), { patientUid: PATIENT, quality: 90 }))
    await assertFails(setDoc(doc(as(PATIENT), 'sessions', 'fake'), { patientUid: OTHER_PATIENT, quality: 90 }))
    await assertSucceeds(getDocs(query(collection(as(PATIENT), 'sessions'), where('patientUid', '==', PATIENT))))
    await assertFails(getDoc(doc(as(PATIENT), 'sessions', 's2')))
  })

  test('a linked caregiver reads (live query) but cannot write', async () => {
    await assertSucceeds(getDocs(query(collection(as(CAREGIVER), 'sessions'), where('patientUid', '==', PATIENT))))
    await assertFails(getDocs(query(collection(as(CAREGIVER), 'sessions'), where('patientUid', '==', OTHER_PATIENT))))
    await assertFails(getDocs(query(collection(as(STRANGER), 'sessions'), where('patientUid', '==', PATIENT))))
    await assertFails(setDoc(doc(as(CAREGIVER), 'sessions', 'x'), { patientUid: PATIENT }))
    await assertFails(updateDoc(doc(as(CAREGIVER), 'sessions', 's1'), { quality: 100 }))
  })

  test('a physio cannot read sessions', async () => {
    await assertFails(getDoc(doc(as(PHYSIO), 'sessions', 's1')))
  })
})

describe('reports', () => {
  test('patient and linked caregiver read; physio only once a review is requested', async () => {
    await assertSucceeds(getDoc(doc(as(PATIENT), 'reports', 'report2')))
    await assertSucceeds(getDoc(doc(as(CAREGIVER), 'reports', 'report2')))
    await assertFails(getDoc(doc(as(STRANGER), 'reports', 'report1')))
    await assertSucceeds(getDoc(doc(as(PHYSIO), 'reports', 'report1')))
    await assertFails(getDoc(doc(as(PHYSIO), 'reports', 'report2')))
    await assertFails(setDoc(doc(as(CAREGIVER), 'reports', 'r9'), { patientUid: PATIENT }))
  })

  test('patient marks a report for review (merge)', async () => {
    await assertSucceeds(setDoc(doc(as(PATIENT), 'reports', 'report2'), { patientUid: PATIENT, reviewRequested: true }, { merge: true }))
  })
})

describe('reviews and plans', () => {
  test('patient creates a pending request for themselves only', async () => {
    await assertSucceeds(setDoc(doc(as(PATIENT), 'reviews', 'r2'), { ...pendingReview, reportId: 'report2' }))
    await assertFails(setDoc(doc(as(PATIENT), 'reviews', 'r3'), { ...pendingReview, status: 'approved' }))
    await assertFails(
      setDoc(doc(as(OTHER_PATIENT), 'reviews', 'r4'), pendingReview), // in another patient's name
    )
  })

  test('patient reads own requests; physio reads all; caregiver none', async () => {
    await assertSucceeds(getDocs(query(collection(as(PATIENT), 'reviews'), where('patientUid', '==', PATIENT))))
    await assertSucceeds(getDocs(collection(as(PHYSIO), 'reviews')))
    await assertFails(getDocs(collection(as(PATIENT), 'reviews')))
    await assertFails(getDoc(doc(as(CAREGIVER), 'reviews', 'review1')))
  })

  const approval = {
    status: 'approved',
    plan: [{ exerciseId: 'mini-squat', reps: 8, sets: 2 }],
    notes: 'Go slowly',
    reviewer: { uid: PHYSIO, name: 'Anitha', registrationNumber: 'KL-1', clinic: 'Revive' },
    reviewedAt: '2026-10-12T10:00:00.000Z',
  }
  const planDoc = (reviewId = 'review1') => ({
    patientUid: PATIENT,
    reviewId,
    exercises: approval.plan,
    notes: approval.notes,
    reviewer: approval.reviewer,
    updatedAt: approval.reviewedAt,
  })

  test('physio approves and writes the plan in one batch', async () => {
    const db = as(PHYSIO)
    const batch = writeBatch(db)
    batch.update(doc(db, 'reviews', 'review1'), approval)
    batch.set(doc(db, 'plans', PATIENT), planDoc())
    await assertSucceeds(batch.commit())
    // ...and then the patient and caregiver read the plan
    await assertSucceeds(getDoc(doc(as(PATIENT), 'plans', PATIENT)))
    await assertSucceeds(getDoc(doc(as(CAREGIVER), 'plans', PATIENT)))
    await assertFails(getDoc(doc(as(STRANGER), 'plans', PATIENT)))
  })

  test('a plan cannot be written without approving its review', async () => {
    await assertFails(setDoc(doc(as(PHYSIO), 'plans', PATIENT), planDoc()))
    await assertFails(setDoc(doc(as(PATIENT), 'plans', PATIENT), planDoc()))
  })

  test('only a physio, only once, only the review fields', async () => {
    await assertFails(updateDoc(doc(as(PATIENT), 'reviews', 'review1'), approval))
    await assertFails(updateDoc(doc(as(PHYSIO), 'reviews', 'review1'), { ...approval, patientUid: OTHER_PATIENT }))
    await assertFails(
      updateDoc(doc(as(PHYSIO), 'reviews', 'review1'), { ...approval, reviewer: { ...approval.reviewer, uid: 'other' } }),
    )
    await assertSucceeds(updateDoc(doc(as(PHYSIO), 'reviews', 'review1'), { status: 'rejected', rejectReason: 'See me', reviewer: approval.reviewer, reviewedAt: approval.reviewedAt }))
    await assertFails(updateDoc(doc(as(PHYSIO), 'reviews', 'review1'), approval)) // already reviewed
  })
})
