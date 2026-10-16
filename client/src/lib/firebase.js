// Firebase setup. Values come from VITE_FIREBASE_* env vars (see client/.env.example).
// If any required one is missing, `firebaseReady` is false, auth/db are null and
// the app shows a setup error instead of the pages (see main.jsx).
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// VITE_FIREBASE_EMULATOR=true: use the local Auth + Firestore emulators (firebase.json)
// with a demo project, no real config needed
export const usingEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === 'true'
const EMULATOR_CONFIG = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-revive.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-revive',
  VITE_FIREBASE_APP_ID: 'demo-app',
}

const ENV = usingEmulator ? EMULATOR_CONFIG : {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Auth + Firestore can't work without these
const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']

/** Names of required env vars that are not set. */
export const missingFirebaseVars = REQUIRED.filter((name) => !ENV[name]?.trim())
export const firebaseReady = missingFirebaseVars.length === 0

let app = null
let auth = null
let db = null
let storage = null

if (firebaseReady) {
  app = initializeApp({
    apiKey: ENV.VITE_FIREBASE_API_KEY,
    authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: ENV.VITE_FIREBASE_PROJECT_ID,
    storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.VITE_FIREBASE_APP_ID,
  })
  auth = getAuth(app)
  // AI replies can contain optional fields left undefined; Firestore would reject those
  db = initializeFirestore(app, { ignoreUndefinedProperties: true })
  storage = getStorage(app)
  if (usingEmulator) {
    const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
    connectFirestoreEmulator(db, host, 8080)
    console.info('[firebase] using the local emulators')
  }
} else {
  console.error(`[firebase] missing ${missingFirebaseVars.join(', ')} in client/.env — see client/.env.example`)
}

export { app, auth, db, storage }
