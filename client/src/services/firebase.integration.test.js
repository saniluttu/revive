// The real services against the Firebase emulators, with firestore.rules enforced:
// patient → physiotherapist → caregiver, as in the demo.
// Run: cd firestore-tests && npm run test:app   (skipped in a plain `npm test`)
import { describe, expect, it } from 'vitest'

const ON = import.meta.env.VITE_FIREBASE_EMULATOR === 'true'

async function waitFor(check, timeoutMs = 5000) {
  const start = Date.now()
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** First value a watch*() function delivers that passes `ok`. */
function nextValue(watch, ok = () => true) {
  return new Promise((resolve, reject) => {
    const stop = watch((v) => {
      if (!ok(v)) return
      setTimeout(() => stop())
      resolve(v)
    }, reject)
  })
}

describe.skipIf(!ON)('Firebase services (emulator)', async () => {
  const auth = await import('./authService.js')
  const reviews = await import('./reviewService.js')
  const links = await import('./linkService.js')
  const sessions = await import('./sessionService.js')

  const run = Date.now().toString(36)
  const email = (who) => `${who}-${run}@revive.test`
  const password = 'secret-123'
  const ids = {}

  it('a physiotherapist signs up with their details', async () => {
    await expect(auth.signUp({ email: email('dr'), password, role: 'physiotherapist', physio: { name: 'Anitha' } })).rejects.toMatchObject({
      code: 'physioDetailsRequired',
    })
    const physio = await auth.signUp({
      email: email('dr'),
      password,
      role: 'physiotherapist',
      physio: { name: 'Anitha', registrationNumber: 'KL-1', clinic: 'Revive' },
    })
    expect(physio).toMatchObject({ role: 'physiotherapist', profile: { name: 'Anitha' } })
    ids.physio = physio.uid
    await auth.logOut()
    expect(auth.getAuthState().user).toBeNull()
  })

  it('a patient signs up, sets a profile and gets a 6-character invite code', async () => {
    const patient = await auth.signUp({ email: email('amma'), password, role: 'patient' })
    expect(patient.profile).toBeNull()
    expect(auth.homePathFor(patient)).toBe('/profile')
    const updated = await auth.updateProfile({ name: 'Lakshmi', age: 68, gender: 'female', language: 'ml' })
    expect(updated.inviteCode).toMatch(/^[A-Z2-9]{6}$/)
    ids.patient = updated.uid
    ids.code = updated.inviteCode
    // the live user doc catches up
    await waitFor(() => auth.getAuthState().user?.inviteCode === ids.code)
  })

  it('the patient asks for a review (once per report) and saves a session', async () => {
    const user = auth.getAuthState().user
    const report = { fileName: 'mri.pdf', diagnosis: 'Knee OA', severity: 'mild', summary_en: 'Mild.', summary_ml: 'ചെറുത്.' }
    const aiPlan = [{ exerciseId: 'mini-squat', reps: 10, sets: 2 }]
    const review = await reviews.requestReview({ user, reportId: `rep-${run}`, report, aiPlan })
    expect(review).toMatchObject({ status: 'pending', patientUid: user.uid, aiPlan })
    await waitFor(() => reviews.getReview(review.id))
    const again = await reviews.requestReview({ user, reportId: `rep-${run}`, report, aiPlan })
    expect(again.id).toBe(review.id)
    expect(reviews.latestReviewFor(user.uid).id).toBe(review.id)
    ids.review = review.id

    const snap = {
      sets: 2,
      history: [
        { counted: true, quality: 80, faults: [] },
        { counted: true, quality: 60, faults: ['kneesIn'] },
        { counted: false, quality: null, faults: ['kneesIn'] },
      ],
    }
    const summary = sessions.sessionSummary({
      patientUid: user.uid,
      exercise: { id: 'mini-squat', reps: 10 },
      snap,
      startedAt: Date.now() - 90_000,
    })
    await sessions.saveSession(summary)
    const mine = await nextValue((ok, fail) => sessions.watchSessions(user.uid, ok, fail), (list) => list.length === 1)
    expect(mine[0]).toMatchObject({ exercise: 'mini-squat', reps: 2, quality: 70, notCounted: 1, wrongMoves: { kneesIn: 2 } })
    await auth.logOut()
  })

  it('a caregiver links with the code and sees sessions, not yet a plan', async () => {
    const caregiver = await auth.signUp({ email: email('son'), password, role: 'caregiver' })
    await expect(links.linkWithCode(caregiver, 'nope')).rejects.toMatchObject({ code: 'invalidCode' })
    await expect(links.linkWithCode(caregiver, 'ZZZZZZ')).rejects.toMatchObject({ code: 'codeNotFound' })
    await expect(links.linkWithCode(caregiver, ids.code, [], 'butler')).rejects.toMatchObject({ code: 'relationRequired' })
    const link = await links.linkWithCode(caregiver, ids.code.toLowerCase(), [], 'son')
    expect(link).toMatchObject({ patientUid: ids.patient, patientName: 'Lakshmi', relation: 'son', status: 'accepted' })
    // linking again: the rules refuse to overwrite the link
    await expect(links.linkWithCode(caregiver, ids.code)).rejects.toMatchObject({ code: 'alreadyLinked' })

    const mine = await nextValue((ok, fail) => links.watchLinks(caregiver.uid, 'caregiver', ok, fail), (l) => l.length === 1)
    expect(mine[0]).toMatchObject({ id: links.linkId(caregiver.uid, ids.patient), relation: 'son' })
    expect(await links.getPatientProfile(ids.patient)).toMatchObject({ name: 'Lakshmi' })
    const seen = await nextValue((ok, fail) => sessions.watchSessions(ids.patient, ok, fail))
    expect(seen).toHaveLength(1)
    expect(await nextValue((ok, fail) => links.watchPlan(ids.patient, ok, fail))).toBeNull()
    ids.caregiver = caregiver.uid
    await auth.logOut()
  })

  it('the physiotherapist sees the pending request and approves an edited plan', async () => {
    const physio = await auth.logIn({ email: email('dr'), password })
    await waitFor(() => reviews.getReview(ids.review))
    expect(reviews.listReviews(undefined, { status: 'pending' }).map((r) => r.id)).toContain(ids.review)
    const done = await reviews.approveReview(ids.review, physio, {
      plan: [{ exerciseId: 'seated-knee-extension', reps: '8', sets: 3 }],
      notes: '  Go slowly ',
    })
    expect(done).toMatchObject({ status: 'approved', notes: 'Go slowly', reviewer: { uid: physio.uid, name: 'Anitha' } })
    await waitFor(() => reviews.getReview(ids.review)?.status === 'approved')
    await expect(reviews.rejectReview(ids.review, physio, 'no')).rejects.toMatchObject({ code: 'alreadyReviewed' })
    await auth.logOut()
  })

  it('the caregiver now sees the approved plan, live', async () => {
    await auth.logIn({ email: email('son'), password })
    const plan = await nextValue((ok, fail) => links.watchPlan(ids.patient, ok, fail), Boolean)
    expect(plan).toMatchObject({ reviewId: ids.review, exercises: [{ exerciseId: 'seated-knee-extension', reps: 8, sets: 3 }] })
    await auth.logOut()
  })

  it('the patient sees the approval and can remove the caregiver', async () => {
    await auth.logIn({ email: email('amma'), password })
    await waitFor(() => reviews.latestReviewFor(ids.patient)?.status === 'approved')
    const mine = await nextValue((ok, fail) => links.watchLinks(ids.patient, 'patient', ok, fail), (l) => l.length === 1)
    await links.unlink(mine[0].id)
    await nextValue((ok, fail) => links.watchLinks(ids.patient, 'patient', ok, fail), (l) => l.length === 0)
    await auth.logOut()
  })

  it('maps Firebase auth errors to our codes', async () => {
    await expect(auth.logIn({ email: email('amma'), password: 'wrong-pass' })).rejects.toMatchObject({ code: 'wrongPassword' })
    await expect(auth.signUp({ email: email('amma'), password, role: 'patient' })).rejects.toMatchObject({ code: 'emailInUse' })
    await expect(auth.signUp({ email: 'bad', password, role: 'patient' })).rejects.toMatchObject({ code: 'invalidEmail' })
  })
})
