// Demo accounts for the 10-minute demo, created through the normal client SDK
// (so the security rules apply exactly as in the app — no admin key needed):
//
//   patient          amma@revive.demo   Lakshmi, 68, Malayalam — knee report, approved plan,
//                                       ~2 weeks of sessions (quality up, pain down)
//   caregiver        son@revive.demo    Arjun — linked to Lakshmi (her son) with her invite code
//   physiotherapist  physio@revive.demo Dr. Anitha Menon — approved Lakshmi's plan
//
//   cd client && npm run seed                   (uses VITE_FIREBASE_* from client/.env)
//   cd client && npm run seed -- --emulator     (local Auth + Firestore emulators)
//
// Password: SEED_PASSWORD env var, default "revive-demo". Safe to run again:
// accounts are reused, sessions are re-dated to end today, and steps already done are skipped.
// Email/password sign-in must be enabled in Firebase console → Authentication.

import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

const emulator = process.argv.includes('--emulator')
const PASSWORD = process.env.SEED_PASSWORD || 'revive-demo'
const DAY_MS = 24 * 60 * 60 * 1000

// ---------- config ----------

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, '')]),
    )
  } catch {
    return {}
  }
}

const env = { ...readEnvFile(new URL('../.env', import.meta.url)), ...process.env }
const config = emulator
  ? { apiKey: 'demo-key', authDomain: 'demo-revive.firebaseapp.com', projectId: 'demo-revive', appId: 'demo' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
const missing = Object.entries(config).filter(([, v]) => !v)
if (missing.length) {
  console.error(`Missing Firebase config in client/.env: ${missing.map(([k]) => k).join(', ')}`)
  process.exit(1)
}

const app = initializeApp(config)
const auth = getAuth(app)
const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

// ---------- demo data ----------

const ACCOUNTS = {
  physio: {
    email: 'physio@revive.demo',
    role: 'physiotherapist',
    profile: { name: 'Anitha Menon', registrationNumber: 'KL-PT-2041', clinic: 'Revive Physio Clinic, Kochi' },
  },
  patient: {
    email: 'amma@revive.demo',
    role: 'patient',
    profile: { name: 'Lakshmi', age: 68, gender: 'female', language: 'ml' },
  },
  caregiver: {
    email: 'son@revive.demo',
    role: 'caregiver',
    profile: { name: 'Arjun' },
  },
}

const ANALYSIS = {
  diagnosis: 'Early osteoarthritis of the right knee with mild joint space narrowing',
  affected_body_parts: ['knee'],
  severity: 'mild',
  restrictions: [{ en: 'Avoid deep squats and kneeling', ml: 'ആഴത്തിൽ കുനിഞ്ഞിരിക്കുന്നതും മുട്ടുകുത്തുന്നതും ഒഴിവാക്കുക' }],
  recommended_exercise_ids: ['mini-squat', 'seated-knee-extension'],
  avoid: [{ en: 'Running and jumping — they load the knee joint', ml: 'ഓട്ടവും ചാട്ടവും — മുട്ടിന് ഭാരം കൂടും' }],
  reason: {
    en: 'Strengthening the thigh muscles supports the knee and eases pain.',
    ml: 'തുടയിലെ പേശികൾ ബലപ്പെടുത്തുന്നത് മുട്ടിന് താങ്ങാകുകയും വേദന കുറയ്ക്കുകയും ചെയ്യും.',
  },
  summary_en: 'Your right knee shows early, mild wear. Gentle strengthening exercises can reduce pain and keep you walking well.',
  summary_ml: 'നിങ്ങളുടെ വലത് മുട്ടിൽ ചെറിയ തേയ്മാനം തുടങ്ങിയിട്ടുണ്ട്. ലളിതമായ വ്യായാമങ്ങൾ വേദന കുറയ്ക്കാനും നന്നായി നടക്കാനും സഹായിക്കും.',
}

const PLAN = [
  { exerciseId: 'seated-knee-extension', reps: 10, sets: 2 },
  { exerciseId: 'mini-squat', reps: 8, sets: 2 },
]

// 10 sessions over the last 13 days: quality improves, pain eases
function demoSessions(patientUid, now = Date.now()) {
  const days = [13, 12, 10, 9, 8, 6, 5, 3, 2, 1]
  return days.map((daysAgo, i) => {
    const plan = PLAN[i % 2]
    const notCounted = i < 3 ? 2 : i < 6 ? 1 : 0
    const date = new Date(now - daysAgo * DAY_MS)
    date.setHours(9 + (i % 3), 15 + i * 3, 0, 0)
    return {
      id: `demo-${patientUid}-${i + 1}`,
      data: {
        patientUid,
        exercise: plan.exerciseId,
        reps: plan.reps * plan.sets - notCounted,
        sets: plan.sets,
        targetReps: plan.reps,
        quality: Math.min(92, 58 + i * 3 + (i % 2) * 2),
        notCounted,
        wrongMoves: i < 5 ? { [plan.exerciseId === 'mini-squat' ? 'kneesIn' : 'leanBack']: Math.max(1, 4 - i) } : {},
        painBefore: Math.max(2, 7 - Math.floor(i / 2)),
        painAfter: Math.max(1, 6 - Math.floor(i / 2)),
        duration: 300 + i * 20,
        date: date.toISOString(),
      },
    }
  })
}

// ---------- steps ----------

const AUTH_MISSING = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials']

/** Signs in (creating the account the first time) and makes sure users/{uid} is right. */
async function signInAs(key) {
  const { email, role, profile } = ACCOUNTS[key]
  await signOut(auth)
  let cred
  try {
    cred = await signInWithEmailAndPassword(auth, email, PASSWORD)
  } catch (err) {
    if (!AUTH_MISSING.includes(err.code)) throw err
    try {
      cred = await createUserWithEmailAndPassword(auth, email, PASSWORD)
      console.log(`  created ${email}`)
    } catch (createErr) {
      if (createErr.code === 'auth/email-already-in-use') {
        throw new Error(`${email} exists with a different password — set SEED_PASSWORD to it, or delete the account`)
      }
      throw createErr
    }
  }
  const uid = cred.user.uid
  const ref = doc(db, 'users', uid)
  const existing = (await getDoc(ref)).data()
  if (existing && existing.role !== role) throw new Error(`${email} already exists as a ${existing.role}`)
  await setDoc(ref, { email, role, profile, ...(existing ? {} : { createdAt: new Date().toISOString(), inviteCode: null }) }, { merge: true })
  return { uid, ...existing, email, role, profile }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

async function seedPatient(patient, physio) {
  let code = patient.inviteCode
  for (let i = 0; !code && i < 5; i++) {
    const candidate = newCode()
    const batch = writeBatch(db)
    batch.set(doc(db, 'inviteCodes', candidate), {
      patientUid: patient.uid,
      patientName: patient.profile.name,
      createdAt: new Date().toISOString(),
    })
    batch.set(doc(db, 'users', patient.uid), { inviteCode: candidate }, { merge: true })
    try {
      await batch.commit()
      code = candidate
    } catch {
      // code taken — try another
    }
  }
  if (!code) throw new Error('could not create an invite code')

  const reportId = `demo-report-${patient.uid}`
  await setDoc(doc(db, 'reports', reportId), {
    patientUid: patient.uid,
    fileName: 'MRI-right-knee.pdf',
    analysis: ANALYSIS,
    provider: 'demo',
    cached: false,
    createdAt: new Date(Date.now() - 15 * DAY_MS).toISOString(),
    reviewRequested: true,
  })

  const mine = await getDocs(query(collection(db, 'reviews'), where('patientUid', '==', patient.uid)))
  let review = mine.docs.map((d) => ({ id: d.id, ...d.data() })).find((r) => r.reportId === reportId)
  if (!review) {
    const ref = doc(collection(db, 'reviews'))
    review = {
      id: ref.id,
      reportId,
      status: 'pending',
      patientUid: patient.uid,
      patient: { uid: patient.uid, name: patient.profile.name, age: patient.profile.age },
      report: {
        fileName: 'MRI-right-knee.pdf',
        diagnosis: ANALYSIS.diagnosis,
        severity: ANALYSIS.severity,
        summary_en: ANALYSIS.summary_en,
        summary_ml: ANALYSIS.summary_ml,
        affected_body_parts: ANALYSIS.affected_body_parts,
        avoid: ANALYSIS.avoid,
        restrictions: ANALYSIS.restrictions,
      },
      aiPlan: PLAN,
      plan: null,
      notes: '',
      rejectReason: '',
      payment: { amount: 199, currency: 'INR', demo: true },
      reviewer: null,
      createdAt: new Date(Date.now() - 15 * DAY_MS).toISOString(),
      reviewedAt: null,
    }
    const { id: _id, ...data } = review
    await setDoc(ref, data)
  }

  for (const s of demoSessions(patient.uid)) await setDoc(doc(db, 'sessions', s.id), s.data)
  return { code, review }
}

async function approve(review, physio) {
  if (review.status !== 'pending') return false
  const reviewedAt = new Date(Date.now() - 14 * DAY_MS).toISOString()
  const reviewer = { uid: physio.uid, name: physio.profile.name, registrationNumber: physio.profile.registrationNumber, clinic: physio.profile.clinic }
  const notes = 'Start gently. Stop if the knee swells or the pain gets worse.'
  const batch = writeBatch(db)
  batch.update(doc(db, 'reviews', review.id), { status: 'approved', plan: PLAN, notes, reviewer, reviewedAt })
  batch.set(doc(db, 'plans', review.patientUid), {
    patientUid: review.patientUid,
    reviewId: review.id,
    exercises: PLAN,
    notes,
    reviewer,
    updatedAt: reviewedAt,
  })
  await batch.commit()
  return true
}

async function link(caregiver, patient, code) {
  const id = `${caregiver.uid}_${patient.uid}`
  const mine = await getDocs(query(collection(db, 'links'), where('caregiverUid', '==', caregiver.uid)))
  if (mine.docs.some((d) => d.id === id)) return false
  await setDoc(doc(db, 'links', id), {
    patientUid: patient.uid,
    caregiverUid: caregiver.uid,
    patientName: patient.profile.name,
    caregiverName: caregiver.profile.name,
    relation: 'son',
    code,
    status: 'accepted',
    createdAt: new Date().toISOString(),
  })
  return true
}

// ---------- run ----------

try {
  console.log(`Seeding demo data into ${emulator ? 'the local emulators' : `project ${config.projectId}`}…`)
  const physio = await signInAs('physio')
  const caregiverAccount = await signInAs('caregiver') // created early so its uid exists
  const patient = await signInAs('patient')
  const { code, review } = await seedPatient(patient, physio)
  console.log(`  patient: invite code ${code}, report + review request, ${demoSessions(patient.uid).length} sessions`)

  await signInAs('physio')
  console.log((await approve(review, physio)) ? '  physiotherapist approved the plan' : '  plan already reviewed')

  const caregiver = await signInAs('caregiver')
  console.log((await link(caregiver, patient, code)) ? '  caregiver linked to the patient' : '  caregiver already linked')

  // Check what the caregiver can now see, through the rules
  const seen = await getDocs(query(collection(db, 'sessions'), where('patientUid', '==', patient.uid)))
  const plan = await getDoc(doc(db, 'plans', patient.uid))
  console.log(`  caregiver sees ${seen.size} sessions and ${plan.exists() ? 'the approved plan' : 'NO plan'}`)
  if (caregiverAccount.uid !== caregiver.uid) throw new Error('caregiver account changed during the run')

  await signOut(auth)
  console.log(`\nDone. Log in with password "${PASSWORD}":`)
  for (const a of Object.values(ACCOUNTS)) console.log(`  ${a.role.padEnd(16)} ${a.email}`)
  console.log(`  Lakshmi's caregiver code: ${code}`)
  process.exit(0)
} catch (err) {
  console.error(`\nSeeding failed: ${err.code ?? ''} ${err.message}`)
  if (err.code === 'auth/operation-not-allowed') console.error('Enable Email/Password sign-in in Firebase console → Authentication → Sign-in method.')
  if (err.code === 'permission-denied') console.error('Publish firestore.rules in Firebase console → Firestore → Rules first.')
  process.exit(1)
}
