// Pure helpers of the Firebase services. The services themselves are tested
// against the emulators in firebase.integration.test.js.
import { describe, expect, it } from 'vitest'
import { toAuthError, toUser } from './authService.js'
import { CODE_LENGTH, newInviteCode, normaliseCode } from './linkService.js'
import { sessionSummary } from './sessionService.js'

describe('invite codes', () => {
  it('are 6 easy-to-read characters', () => {
    for (let i = 0; i < 50; i++) expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    expect(CODE_LENGTH).toBe(6)
  })

  it('accept what people type, reject what cannot be a code', () => {
    expect(normaliseCode(' abc 23x ')).toBe('ABC23X')
    expect(normaliseCode('ABC-234')).toBe('ABC234')
    expect(normaliseCode('ABC23')).toBeNull()
    expect(normaliseCode('ABCDE0')).toBeNull() // 0 is not used
  })
})

describe('sessionSummary', () => {
  it('summarises the rep counter history', () => {
    const snap = {
      sets: 2,
      history: [
        { counted: true, quality: 90, faults: [] },
        { counted: true, quality: 71, faults: ['leanBack'] },
        { counted: false, quality: null, faults: ['leanBack'] },
      ],
    }
    const s = sessionSummary({
      patientUid: 'p1',
      exercise: { id: 'seated-knee-extension', reps: 10 },
      snap,
      startedAt: 1_000,
      endedAt: 181_400,
    })
    expect(s).toEqual({
      patientUid: 'p1',
      exercise: 'seated-knee-extension',
      reps: 2,
      sets: 2,
      targetReps: 10,
      quality: 81,
      notCounted: 1,
      wrongMoves: { leanBack: 2 },
      painBefore: null,
      painAfter: null,
      duration: 180,
      date: new Date(181_400).toISOString(),
    })
  })
})

describe('auth helpers', () => {
  it('maps Firebase error codes to ours', () => {
    expect(toAuthError({ code: 'auth/email-already-in-use' }).code).toBe('emailInUse')
    expect(toAuthError({ code: 'auth/invalid-credential' }).code).toBe('wrongPassword')
    expect(toAuthError({ code: 'auth/network-request-failed' }).code).toBe('network')
    expect(toAuthError({ code: 'auth/something-new' }).code).toBe('unknown')
    expect(toAuthError({ code: 'weakPassword' }).code).toBe('weakPassword')
  })

  it('builds the app user from users/{uid}', () => {
    expect(toUser('u1', { email: 'a@b.in', role: 'patient', profile: { name: 'L' }, createdAt: 'x' })).toEqual({
      uid: 'u1',
      email: 'a@b.in',
      role: 'patient',
      profile: { name: 'L' },
      createdAt: 'x',
      inviteCode: null,
    })
    expect(toUser('u1', undefined)).toBeNull()
  })
})
