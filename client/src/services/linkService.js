// Caregiver ↔ patient links (F9), on Firestore.
//
//   inviteCodes/{code}  { patientUid, patientName, createdAt }  — a patient's 6-character code.
//                        Anyone signed in may read one code they know; nobody can list them.
//   links/{caregiverUid}_{patientUid}  { patientUid, caregiverUid, patientName, caregiverName,
//                        relation, code, status: 'accepted', createdAt }
//                        relation: the caregiver's relation to the patient (RELATIONS), null on older links
//
// Sharing the code is the patient's consent, so a link made with a valid code is
// accepted straight away; the patient sees their caregivers on Home and can remove one.
// The security rules check the code when the link is created (see firestore.rules).

import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

// No 0/O, 1/I/L: easy to read out over the phone
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const LINK_STATUS = { PENDING: 'pending', ACCEPTED: 'accepted' }
/** The caregiver's relation to the patient; labels in i18n `link.relations.<id>`. */
export const RELATIONS = ['son', 'daughter', 'spouse', 'grandchild', 'relative', 'friend', 'homeNurse']

/** Errors carry a `code`; the UI shows i18n `link.errors.<code>`. */
function linkError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

export function newInviteCode(random = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')
}

/** "abc 23x" → "ABC23X"; null if it can't be a code */
export function normaliseCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

export const linkId = (caregiverUid, patientUid) => `${caregiverUid}_${patientUid}`

/**
 * Gives a patient an invite code (once; concurrent calls share one attempt). A code that's already taken fails the
 * write (rules allow create only), so another is tried.
 * @returns {Promise<string>} the code
 */
const making = new Map() // uid → Promise<code>, so two callers don't make two codes

export function ensureInviteCode(user, options) {
  if (user.inviteCode) return Promise.resolve(user.inviteCode)
  if (!making.has(user.uid)) {
    making.set(
      user.uid,
      makeInviteCode(user, options).finally(() => making.delete(user.uid)),
    )
  }
  return making.get(user.uid)
}

async function makeInviteCode(user, { random = Math.random, tries = 5 } = {}) {
  let lastError
  for (let i = 0; i < tries; i++) {
    const code = newInviteCode(random)
    const batch = writeBatch(db)
    batch.set(doc(db, 'inviteCodes', code), {
      patientUid: user.uid,
      patientName: user.profile?.name ?? '',
      createdAt: new Date().toISOString(),
    })
    batch.set(doc(db, 'users', user.uid), { inviteCode: code }, { merge: true })
    try {
      await batch.commit()
      return code
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/**
 * A caregiver links to a patient with the patient's invite code.
 * @param existingLinks the caregiver's current links (from watchLinks), to spot a repeat
 * @param relation      one of RELATIONS (or null)
 * @returns {Promise<object>} the link
 */
export async function linkWithCode(caregiver, input, existingLinks = [], relation = null) {
  const code = normaliseCode(input)
  if (!code) throw linkError('invalidCode')
  if (relation != null && !RELATIONS.includes(relation)) throw linkError('relationRequired')
  let invite
  try {
    invite = await getDoc(doc(db, 'inviteCodes', code))
  } catch (err) {
    throw linkError(err.code === 'unavailable' ? 'network' : 'unknown')
  }
  if (!invite.exists()) throw linkError('codeNotFound')
  const { patientUid, patientName } = invite.data()
  if (patientUid === caregiver.uid) throw linkError('codeNotFound')
  if (existingLinks.some((l) => l.patientUid === patientUid)) throw linkError('alreadyLinked')

  const link = {
    patientUid,
    caregiverUid: caregiver.uid,
    patientName: patientName ?? '',
    caregiverName: caregiver.profile?.name ?? caregiver.email ?? '',
    relation,
    code,
    status: LINK_STATUS.ACCEPTED,
    createdAt: new Date().toISOString(),
  }
  const id = linkId(caregiver.uid, patientUid)
  try {
    await setDoc(doc(db, 'links', id), link)
  } catch (err) {
    // An existing link can't be overwritten (rules), so permission-denied here means "already linked"
    throw linkError(err.code === 'permission-denied' ? 'alreadyLinked' : 'unknown')
  }
  return { id, ...link }
}

/** Either side removes a link. */
export async function unlink(id) {
  await deleteDoc(doc(db, 'links', id))
}

/**
 * Live list of links for a caregiver (`as: 'caregiver'`) or a patient (`as: 'patient'`).
 * @returns {() => void} unsubscribe
 */
export function watchLinks(uid, as, onChange, onError = () => {}) {
  const field = as === 'patient' ? 'patientUid' : 'caregiverUid'
  return onSnapshot(
    query(collection(db, 'links'), where(field, '==', uid)),
    (snap) => {
      const links = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => l.status === LINK_STATUS.ACCEPTED)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      onChange(links)
    },
    onError,
  )
}

/**
 * Live approved plan of a patient: plans/{patientUid} = { patientUid, reviewId, exercises, notes, reviewer, updatedAt }
 * @returns {() => void} unsubscribe
 */
export function watchPlan(patientUid, onChange, onError = () => {}) {
  return onSnapshot(doc(db, 'plans', patientUid), (snap) => onChange(snap.exists() ? snap.data() : null), onError)
}

/** A linked patient's profile (name, age, gender…) or null. */
export async function getPatientProfile(patientUid) {
  const snap = await getDoc(doc(db, 'users', patientUid))
  return snap.exists() ? (snap.data().profile ?? null) : null
}

/**
 * What a linked caregiver's PDF needs about the patient: users/{uid} and the
 * latest analysed report (rules: readable once linked). Either may be null.
 */
export async function getPatientRecord(patientUid) {
  const [userSnap, reportsSnap] = await Promise.all([
    getDoc(doc(db, 'users', patientUid)),
    getDocs(query(collection(db, 'reports'), where('patientUid', '==', patientUid))),
  ])
  const reports = reportsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.analysis)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return { user: userSnap.exists() ? userSnap.data() : null, report: reports[0] ?? null }
}
