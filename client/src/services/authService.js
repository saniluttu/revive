// Auth service: the only module pages use for login state.
//
// Firebase Auth (email + password); role and profile live in Firestore
// `users/{uid}` = { email, role, profile, createdAt, inviteCode? }. The user
// doc is watched live, so a profile change on one device shows on the others.

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'
import { ensureInviteCode } from './linkService.js'

export const ROLES = {
  PATIENT: 'patient',
  CAREGIVER: 'caregiver',
  PHYSIO: 'physiotherapist',
}

/**
 * @typedef {{ name: string, age: number, gender: string, language: 'ml' | 'en' }} Profile
 * @typedef {{ name: string, registrationNumber: string, clinic: string }} PhysioProfile
 * @typedef {{ uid: string, email: string, role: 'patient' | 'caregiver' | 'physiotherapist',
 *             profile: Profile | PhysioProfile | null, createdAt: string, inviteCode: string | null }} User
 */

/** Errors carry a `code`; the UI shows i18n `errors.<code>`. */
function authError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

const FIREBASE_ERRORS = {
  'auth/email-already-in-use': 'emailInUse',
  'auth/invalid-email': 'invalidEmail',
  'auth/weak-password': 'weakPassword',
  'auth/missing-password': 'weakPassword',
  'auth/invalid-credential': 'wrongPassword',
  'auth/invalid-login-credentials': 'wrongPassword',
  'auth/wrong-password': 'wrongPassword',
  'auth/user-not-found': 'wrongPassword',
  'auth/user-disabled': 'wrongPassword',
  'auth/too-many-requests': 'tooManyAttempts',
  'auth/network-request-failed': 'network',
  unavailable: 'network',
}

/** Any error → one with our `code` (Firebase codes are mapped; ours pass through) */
export function toAuthError(err) {
  if (err?.code && !String(err.code).includes('/') && !(err.code in FIREBASE_ERRORS) && err.code !== 'permission-denied') {
    return err
  }
  console.warn('[auth]', err?.code, err?.message)
  return authError(FIREBASE_ERRORS[err?.code] ?? 'unknown')
}

const userRef = (uid) => doc(db, 'users', uid)

/** users/{uid} doc → User */
export function toUser(uid, data) {
  if (!data) return null
  return {
    uid,
    email: data.email ?? '',
    role: data.role,
    profile: data.profile ?? null,
    createdAt: data.createdAt ?? '',
    inviteCode: data.inviteCode ?? null,
  }
}

// ---------- state ----------

const listeners = new Set()
let state = { user: null, loading: Boolean(auth) }
let stopUserDoc = null
let signingUp = false // between creating the account and writing users/{uid}

function setState(next) {
  if (next.user === state.user && next.loading === state.loading) return
  state = next
  listeners.forEach((cb) => cb(state))
}

function watchUser(uid) {
  stopUserDoc?.()
  stopUserDoc = onSnapshot(
    userRef(uid),
    (snap) => {
      if (!snap.exists()) {
        // A new account's doc is still being written; otherwise there's no usable profile
        if (!signingUp) setState({ user: null, loading: false })
        return
      }
      setState({ user: toUser(uid, snap.data()), loading: false })
    },
    (err) => {
      console.warn('[auth] could not read the user profile', err.code)
      setState({ user: null, loading: false })
    },
  )
}

if (auth) {
  onFirebaseAuthStateChanged(auth, (fbUser) => {
    if (!fbUser) {
      stopUserDoc?.()
      stopUserDoc = null
      setState({ user: null, loading: false })
      return
    }
    if (state.user?.uid !== fbUser.uid) setState({ user: null, loading: true })
    watchUser(fbUser.uid)
  })
}

function requireFirebase() {
  if (!auth || !db) throw authError('firebaseMissing')
}

function normaliseEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * Physiotherapists give their details at signup: `physio` = { name, registrationNumber, clinic }.
 * Other roles set up their profile afterwards.
 * @returns {Promise<User>}
 */
export async function signUp({ email, password, role, physio }) {
  requireFirebase()
  email = normaliseEmail(email)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw authError('invalidEmail')
  if (!password || password.length < 6) throw authError('weakPassword')
  if (!Object.values(ROLES).includes(role)) throw authError('invalidRole')

  let profile = null
  if (role === ROLES.PHYSIO) {
    profile = {
      name: String(physio?.name ?? '').trim(),
      registrationNumber: String(physio?.registrationNumber ?? '').trim(),
      clinic: String(physio?.clinic ?? '').trim(),
    }
    if (!profile.name || !profile.registrationNumber || !profile.clinic) throw authError('physioDetailsRequired')
  }

  signingUp = true
  try {
    const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password)
    const data = { email, role, profile, createdAt: new Date().toISOString(), inviteCode: null }
    await setDoc(userRef(fbUser.uid), data)
    const user = toUser(fbUser.uid, data)
    setState({ user, loading: false })
    return user
  } catch (err) {
    throw toAuthError(err)
  } finally {
    signingUp = false
  }
}

/** @returns {Promise<User>} */
export async function logIn({ email, password }) {
  requireFirebase()
  try {
    const { user: fbUser } = await signInWithEmailAndPassword(auth, normaliseEmail(email), password)
    const snap = await getDoc(userRef(fbUser.uid))
    const user = toUser(fbUser.uid, snap.data())
    if (!user) throw authError('noProfile')
    setState({ user, loading: false })
    return user
  } catch (err) {
    throw toAuthError(err)
  }
}

export async function logOut() {
  if (auth) await signOut(auth)
  setState({ user: null, loading: false })
}

/**
 * Merge fields into the logged-in user's profile. A patient also gets an
 * invite code for their caregiver the first time. @returns {Promise<User>}
 */
export async function updateProfile(patch) {
  requireFirebase()
  const current = state.user
  if (!current) throw authError('notLoggedIn')
  const profile = { ...current.profile, ...patch }
  try {
    await setDoc(userRef(current.uid), { profile }, { merge: true })
    let user = { ...current, profile }
    if (user.role === ROLES.PATIENT && !user.inviteCode) {
      user = { ...user, inviteCode: await ensureInviteCode(user) }
    }
    setState({ user, loading: false })
    return user
  } catch (err) {
    throw toAuthError(err)
  }
}

/**
 * Current auth state. Returns the same object until it changes, so it can be
 * used with React's useSyncExternalStore. `loading` is true while Firebase
 * restores a session and reads the user's profile.
 * @returns {{ user: User | null, loading: boolean }}
 */
export function getAuthState() {
  return state
}

/** Subscribe to auth changes. @returns {() => void} unsubscribe */
export function onAuthStateChanged(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Where a user lands after login. */
export function homePathFor(user) {
  if (!user) return '/login'
  if (user.role === ROLES.CAREGIVER) return '/caregiver'
  if (user.role === ROLES.PHYSIO) return '/reviews'
  return user.profile ? '/home' : '/profile'
}
