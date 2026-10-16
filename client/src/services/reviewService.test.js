import { beforeAll, describe, expect, it, vi } from 'vitest'

// In-memory localStorage (tests run in Node)
const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
})

let svc
beforeAll(async () => {
  svc = await import('./reviewService.js')
})

const patient = { uid: 'p1', email: 'p@x.in', role: 'patient', profile: { name: 'Lakshmi', age: 68 } }
const physio = { uid: 'd1', role: 'physiotherapist', profile: { name: 'Anitha', registrationNumber: 'KL-123', clinic: 'Revive Clinic' } }
const report = { fileName: 'mri.pdf', diagnosis: 'Knee OA', severity: 'mild', summary_en: 'Mild wear.', summary_ml: 'ചെറിയ തേയ്മാനം.' }
const aiPlan = [{ exerciseId: 'mini-squat', reps: 10, sets: 2 }]

describe('reviewService', () => {
  it('creates one pending request per report, with demo payment and patient details', async () => {
    const r = await svc.requestReview({ user: patient, reportId: 'rep1', report, aiPlan })
    expect(r).toMatchObject({
      status: 'pending',
      patient: { uid: 'p1', name: 'Lakshmi', age: 68 },
      payment: { amount: 199, currency: 'INR', demo: true },
      aiPlan,
    })
    const again = await svc.requestReview({ user: patient, reportId: 'rep1', report, aiPlan })
    expect(again.id).toBe(r.id)
    expect(svc.listReviews(undefined, { status: 'pending' })).toHaveLength(1)
    expect(svc.latestReviewFor('p1').id).toBe(r.id)
  })

  it('approves with an edited plan and notes, recording the reviewer; cannot review twice', async () => {
    const [r] = svc.listReviews(undefined, { status: 'pending' })
    const listener = vi.fn()
    const off = svc.onReviewsChanged(listener)
    const done = await svc.approveReview(r.id, physio, {
      plan: [{ exerciseId: 'seated-knee-extension', reps: '8', sets: 3 }],
      notes: '  Go slowly  ',
    })
    off()
    expect(listener).toHaveBeenCalledOnce()
    expect(done).toMatchObject({
      status: 'approved',
      plan: [{ exerciseId: 'seated-knee-extension', reps: 8, sets: 3 }],
      notes: 'Go slowly',
      reviewer: { uid: 'd1', name: 'Anitha', registrationNumber: 'KL-123', clinic: 'Revive Clinic' },
    })
    await expect(svc.rejectReview(r.id, physio, 'no')).rejects.toMatchObject({ code: 'alreadyReviewed' })
  })

  it('reject needs a reason; a rejected report can be requested again', async () => {
    const r = await svc.requestReview({ user: patient, reportId: 'rep2', report, aiPlan })
    await expect(svc.rejectReview(r.id, physio, '  ')).rejects.toMatchObject({ code: 'reasonRequired' })
    const rejected = await svc.rejectReview(r.id, physio, 'See me in clinic first')
    expect(rejected).toMatchObject({ status: 'rejected', rejectReason: 'See me in clinic first' })
    const fresh = await svc.requestReview({ user: patient, reportId: 'rep2', report, aiPlan })
    expect(fresh.id).not.toBe(r.id)
    expect(fresh.status).toBe('pending')
  })

  it('will not approve an empty plan', async () => {
    const r = await svc.requestReview({ user: patient, reportId: 'rep3', report, aiPlan: [] })
    await expect(svc.approveReview(r.id, physio)).rejects.toMatchObject({ code: 'emptyPlan' })
  })
})
