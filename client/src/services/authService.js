// Auth service: the only module pages use for login state.
//
// This implementation keeps users in localStorage so the app works without a
// backend. To move to Firebase Auth, re-implement these exports (signUp →
// createUserWithEmailAndPassword + users/{uid} doc, onAuthStateChanged →
// Firebase's listener, etc.) and keep the same signatures and user shape.
//
// NOTE: dev stub only. Passwords are stored unhashed in this browser's
// localStorage, so never use a real password here.

export const ROLES = {
  PATIENT: 'patient',
  CAREGIVER: 'caregiver',
}

/**
 * @typedef {{ name: string, age: number, gender: string, language: 'ml' | 'en' }} Profile
 * @typedef {{ uid: string, email: string, role: 'patient' | 'caregiver', profile: Profile | null, createdAt: string }} User
 */

const USERS_KEY = 'revive.users' // { [email]: { ...User, password } }
const SESSION_KEY = 'revive.session' // uid of the logged-in user

const listeners = new Set()
let state = { user: readSessionUser(), loading: false }

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function publicUser(record) {
  if (!record) return null
  const { password: _password, ...user } = record
  return user
}

function readSessionUser() {
  const uid = localStorage.getItem(SESSION_KEY)
  if (!uid) return null
  return publicUser(Object.values(readUsers()).find((u) => u.uid === uid))
}

function setState(next) {
  state = next
  listeners.forEach((cb) => cb(state))
}

function normaliseEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function newUid() {
  return crypto.randomUUID?.() ?? `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

// Keep other tabs in sync (login / logout in one tab updates the rest)
window.addEventListener('storage', (e) => {
  if (e.key === SESSION_KEY || e.key === USERS_KEY) setState({ user: readSessionUser(), loading: false })
})

/** @returns {Promise<User>} */
export async function signUp({ email, password, role }) {
  email = normaliseEmail(email)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Please enter a valid email address.')
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.')
  if (!Object.values(ROLES).includes(role)) throw new Error('Please choose Patient or Caregiver.')

  const users = readUsers()
  if (users[email]) throw new Error('An account with this email already exists. Please log in.')

  const record = { uid: newUid(), email, password, role, profile: null, createdAt: new Date().toISOString() }
  users[email] = record
  writeUsers(users)
  localStorage.setItem(SESSION_KEY, record.uid)
  const user = publicUser(record)
  setState({ user, loading: false })
  return user
}

/** @returns {Promise<User>} */
export async function logIn({ email, password }) {
  const record = readUsers()[normaliseEmail(email)]
  if (!record || record.password !== password) throw new Error('Incorrect email or password.')
  localStorage.setItem(SESSION_KEY, record.uid)
  const user = publicUser(record)
  setState({ user, loading: false })
  return user
}

export async function logOut() {
  localStorage.removeItem(SESSION_KEY)
  setState({ user: null, loading: false })
}

/** Merge fields into the logged-in user's profile. @returns {Promise<User>} */
export async function updateProfile(patch) {
  const current = state.user
  if (!current) throw new Error('You are not logged in.')
  const users = readUsers()
  const record = users[current.email]
  record.profile = { ...record.profile, ...patch }
  writeUsers(users)
  const user = publicUser(record)
  setState({ user, loading: false })
  return user
}

/**
 * Current auth state. Returns the same object until it changes, so it can be
 * used with React's useSyncExternalStore. `loading` is true while the backend
 * restores a session (always false for the local implementation).
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
  return user.profile ? '/home' : '/profile'
}
