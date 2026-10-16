# Revive — AI Avatar-Guided Home Physiotherapy
**She Builds Tech 3.0 (KSUM) — Final Requirements & Build Plan**
Build window: 16 Oct 4:00 PM → 17 Oct 7:00 AM code freeze
Repo: https://github.com/saniluttu/revive

> Rule check: all code must be written during the hackathon. External projects
> (e.g. Physio-Galenus) are reference for ideas only — no copied code.
> Public libraries and APIs are allowed. Commit after every feature.

> **Scope update (mentor feedback, 16 Oct):** the demo is **10 minutes** and covers only the
> five demo pillars in §3. Everything else is in **Parked** (§4) — do not build parked items
> until all five pillars are polished and rehearsed.

---

## 1. Core Idea
Elderly and recovering patients doing physiotherapy at home have no one to correct them,
and their family can't see whether they're improving.

**Revive** reads the patient's medical (MRI) report, suggests the right exercises, shows them
through a **3D avatar**, watches the patient through a webcam/phone (no wearables), **counts reps
and checks form**, **listens and speaks in Malayalam**, and lets **sons/daughters on their own
device** see every session and download a report for the next doctor visit.

**Pitch line:** *A physiotherapist at home that speaks Malayalam — and keeps the family in the loop.*

---

## 2. Demo Story
**Amma** (60s) lives at home in Kerala, recovering from a **knee and shoulder** problem. Her MRI
report says early knee osteoarthritis and a stiff (frozen) shoulder. Her physiotherapist gave
her exercises, but at home nobody corrects her, she is more comfortable in Malayalam than
English, and she isn't sure she is doing them right.

Her **son** works in another city (e.g. Bengaluru). He can't visit every week, but he wants to
know whether Amma is actually doing her exercises and whether she's getting better.

1. Amma uploads her MRI report → Revive explains it in Malayalam and suggests her exercises.
2. The 3D avatar shows each exercise; Amma follows along on camera.
3. Revive counts her reps aloud in Malayalam and corrects her ("നേരെ നിൽക്കുക") when she leans
   or shrugs. She asks a question by voice in Malayalam and hears the answer in Malayalam.
4. On **his own phone/laptop**, the son opens Revive and sees today's session summary —
   reps, quality, wrong movements, pain before/after.
5. Before the next doctor visit he downloads a **PDF report** for the doctor.

Every feature we build must serve a step in this story.

---

## 3. Demo Pillars (the only P0 work)
| # | Pillar | Story step |
|---|---|---|
| D1 | **MRI report → AI suggested exercises** (F3) | 1 |
| D2 | **The 4 exercises, fully polished**, with rep counting + form monitoring (F4, F6) | 2–3 |
| D3 | **Malayalam voice:** speech-to-text input + spoken Malayalam feedback and answers (F7, F10) | 3 |
| D4 | **3D avatar demo of each of the 4 exercises** (F5) | 2 |
| D5 | **Caregiver on a separate device** sees patient session summaries + downloads PDF (F8, F9) | 4–5 |

Supporting (needed for the pillars, keep minimal): F1 Login/signup, F2 Profile,
**Firebase Auth + Firestore** (required for D5 cross-device — see §6).

**The 4 exercises:** shoulder abduction, shoulder flexion, mini squat, seated knee extension.
"Fully polished" = reliable rep counting, every form rule in F6 firing correctly, Malayalam cue
for each correction, avatar animation, and a clean session summary saved to Firestore.

---

## 4. Parked
Not in the demo. Only touch these if **all** pillars are done, polished and rehearsed.

| Feature | Note |
|---|---|
| "Hey Revive" wake word | **Bonus only if time.** Demo uses a push-to-talk mic button instead |
| Prescription assistant (old F13) | Upload prescription → Malayalam medicine guide, foods to avoid |
| Fatigue detection (old F12) | Rep-time / ROM drop over a set → rest prompt |
| Reminders & notifications (old F11) | Exercise/checkup reminders, browser push, missed-session alerts |
| Extra body parts | Lower back (bridge, cat-cow), neck (side tilt, chin tuck) |

Parked screens (Reminders, Prescription) stay out of the navbar for the demo.

---

## 5. Functional Requirements

### F1 — Login / Signup (supporting)
- Email + password via **Firebase Auth**
- Choose role at signup: Patient / Caregiver
- Route to Patient Home or Caregiver Dashboard after login

### F2 — Patient Profile (supporting)
- Name, age, gender, preferred language (Malayalam / English)
- Pain level slider (0–10) asked before and after each session

### F3 — Medical Report Analysis (D1)
- Upload PDF or image of the radiologist's **written report** (we read the report text,
  we do not interpret raw MRI scans)
- Vision LLM extracts → JSON:
  `{ diagnosis, affected_body_parts[], severity, restrictions[], recommended_exercise_ids[], reason }`
- LLM may only choose exercise IDs from our 4-exercise library (passed in prompt)
- Shows: findings summary (English + Malayalam), body parts to focus on, suggested exercises
  with reason, exercises to **avoid**
- Malayalam summary can be read aloud (D3 TTS)
- **"Skip"** button → manual selection (F4)
- Disclaimer on screen: *AI suggestions — follow your doctor/physiotherapist's advice*
- Demo: our own sample MRI report matching the demo story (knee + shoulder); keep a cached
  response as backup if APIs fail

### F4 — Exercise Selection (D2)
- Cards for Shoulder and Knee only
- Exercise list per body part with difficulty, reps, sets

| Body part | Exercises | Conditions |
|---|---|---|
| Shoulder | Shoulder abduction, shoulder flexion | Frozen shoulder, rotator cuff |
| Knee | Mini squat, seated knee extension | Osteoarthritis, post-surgery |

### F5 — 3D Avatar (D4)
- React Three Fiber + rigged GLB character (Ready Player Me / Mixamo)
- One animation for **each** of the 4 exercises, looping; play/pause/slow
- Layout: avatar (left) | patient camera + skeleton (right)
- **Fallback:** animated 2D skeleton from recorded reference landmarks

### F6 — Pose Tracking, Rep Counting, Monitoring (D2)
- MediaPipe Pose Landmarker **in the browser** (free, no rate limits, works offline)
- Skeleton overlay, framing check ("step back, full body not visible")
- Joint angles from landmarks; rep state machine
  `START → UP → TOP → DOWN → START` = 1 rep (only if target ROM reached)
- Reps done with a compensation (shrug, lean, etc.) are not counted
- Form monitoring (compensation rules):

| Exercise | Wrong movement | Rule |
|---|---|---|
| Shoulder abduction | Body leaning sideways | Shoulder-hip line tilt > 10° |
| Shoulder abduction/flexion | Shoulder shrug | Shoulder-to-ear distance drops > 20% from baseline |
| Shoulder flexion | Back arching | Trunk leans back > 10° |
| Mini squat | Knees caving in | Knee gap < ankle gap (front view) |
| Mini squat | Leaning forward | Trunk > 45° from vertical |
| Knee extension | Leaning back | Trunk angle change > 15° |

- Per-rep quality score 0–100 (ROM reached, smoothness, no wrong movement)
- On-screen: rep count, sets, quality, live correction text

### F7 — Malayalam Spoken Feedback During Exercise (D3)
- **No LLM per frame.** Pre-generate cues once with TTS, save as audio files, play from cache:
  rep numbers 1–20, one correction per form rule in F6 (e.g. "കൈ കുറച്ചുകൂടി ഉയർത്തുക",
  "നേരെ നിൽക്കുക", "തോൾ താഴ്ത്തുക"), "നന്നായി!", "വിശ്രമിക്കൂ", "സെറ്റ് പൂർത്തിയായി"
- 3-second cooldown per cue; English fallback

### F8 — Session Summaries (D5)
- Each session saved to **Firestore**: date, exercise, reps, sets, avg quality,
  wrong-movement counts, pain before/after, duration
- Patient sees a session summary screen after each session
- Simple history: last sessions list + quality trend and pain trend charts (keep lean —
  just enough to make the caregiver view and the PDF meaningful)

### F9 — Caregiver Monitoring (D5)
- Patient Home shows an **invite code**; caregiver enters it on **their own device** to link;
  patient accepts the link (consent)
- Caregiver Dashboard: linked patient → session summaries (read-only, live via Firestore
  listener), last session time
- **Download PDF report** (jsPDF): patient details, report findings, exercise plan,
  session history, quality and pain trends — for the doctor follow-up
- Demo: patient on laptop, son on a phone, both logged in at once

### F10 — Malayalam Voice Assistant (D3)
- **Push-to-talk** mic button (no wake word — wake word is parked)
- Speech-to-text in Malayalam (`ml-IN`) → LLM → answer spoken back in Malayalam (TTS),
  text shown too
- Also works for typed questions, Malayalam or English
- Scope: exercises, recovery and app help; knows the patient's plan and recent sessions
- Red flags (chest pain, severe pain, numbness, swelling, fall) → "Stop and contact your doctor"
- Disclaimer on screen

---

## 6. Data & Backend: Firebase Auth + Firestore
The caregiver must see the patient's data **from a different device**, so `localStorage`
cannot be the store. Replace it with Firebase:

- `client/src/services/authService.js` is already the single auth interface — re-implement it
  on Firebase Auth (+ `users/{uid}` doc) keeping the same exports and user shape, so pages
  don't change.
- Add a matching data service (sessions, reports, links) on Firestore; no page talks to
  Firestore directly.
- Security rules: patients read/write their own docs; a caregiver can read a patient's
  `users`, `reports`, `plans`, `sessions` docs only when an accepted `links` doc exists.

### Firestore collections
- `users/{uid}` — role, name, age, gender, language, inviteCode
- `links/{id}` — patientUid, caregiverUid, status (pending / accepted)
- `reports/{id}` — patientUid, extracted JSON, createdAt
- `plans/{patientUid}` — exercises, reps, sets
- `sessions/{id}` — patientUid, exercise, reps, sets, quality, wrongMoves, painBefore,
  painAfter, duration, date

### Multi-API Fallback Router
Backend module `llmRouter` (Node + Express) — every AI call goes through it.

```
providers = [Gemini Flash, Groq, OpenRouter free model]
for p in providers (skip ones cooling down):
    try: return p.call(request)          # 15 s timeout
    except 429 / quota / timeout / 5xx:
        cool down p for 60 s; try next
all failed → return cached/demo response + friendly message
```
- Multiple keys per provider allowed (round-robin), all in `.env` (never committed)
- Log which provider answered; show a small "answered by: X" badge in demo

| Task | Primary | Fallbacks |
|---|---|---|
| Report reading (vision) | Gemini | Groq vision model (images only) → OpenRouter free vision model |
| Voice assistant answers | Groq | Gemini → OpenRouter |
| Malayalam TTS | Sarvam AI / Google Cloud TTS (ml-IN) | Browser speechSynthesis |
| Malayalam STT | Browser Web Speech (ml-IN) | Groq Whisper / Sarvam |

Pose tracking never goes to an API.

---

## 7. Non-Functional Requirements
- Works on laptop webcam and phone browser (responsive, large text & buttons for elderly users)
- Caregiver view works on a phone, on a different network from the patient
- Form-cue latency < 300 ms
- Video never leaves the device; only the report image and voice-assistant text go to AI APIs
- Medical disclaimer on report and voice-assistant screens
- Malayalam + English UI toggle

---

## 8. Tech Stack
- **Frontend:** React + Vite + Tailwind, React Router
- **Pose:** `@mediapipe/tasks-vision`
- **Avatar:** three, `@react-three/fiber`, `@react-three/drei`
- **Charts:** Recharts  **PDF:** jsPDF + html2canvas
- **Auth / DB / Storage:** Firebase (Auth, Firestore, Storage)
- **Backend:** Node + Express (LLM router, report parsing, TTS) — keeps API keys hidden

---

## 9. Screens (demo)
1. Login / Signup (role select)
2. Patient profile setup
3. Report upload → AI analysis results (or Skip)
4. Exercise selection (shoulder / knee)
5. **Live session** — avatar | camera + skeleton | reps | quality | correction text
6. Session summary
7. Progress (lean history)
8. Voice assistant (push-to-talk, Malayalam)
9. Caregiver dashboard + PDF download

---

## 10. Build Phases (one phase at a time, commit after each)
Done: 1 Setup · 2 Auth & profile (localStorage stub) · 3 Pose core · 4 Exercises, rep counting,
form rules.

5. **Firebase migration:** authService on Firebase Auth, Firestore data service,
   security rules; remove localStorage as the data store
6. **Report analysis (D1):** llmRouter + upload → JSON → suggestions, cached demo response
7. **Malayalam voice (D3):** cue pack + playback during session (F7); push-to-talk STT →
   LLM → Malayalam TTS assistant (F10)
8. **Avatar (D4):** GLB model + animations for all 4 exercises, side-by-side layout
9. **Sessions + caregiver (D5):** save sessions to Firestore, summary screen, invite/link,
   caregiver dashboard, PDF report; test with two devices
10. **Polish the 4 exercises (D2):** tune thresholds on real people, Malayalam UI strings,
    demo data matching the story, bug fixes, rehearse the 10-minute demo
11. Bonus only if all of the above is done: "Hey Revive" wake word

---

## 11. Timeline Aligned to Checkpoints
| Time | Target | Show at checkpoint |
|---|---|---|
| till 11:30 PM | Phases 5–6 | **Progress Checkpoint:** rep counting + wrong-movement alert, Firebase login, report analysis |
| 12:00–3:30 AM | Phases 7–9 | **Mentor Checkpoint II:** full patient flow + Malayalam voice + caregiver on second device + PDF |
| 3:30–6:30 AM | Phase 10 (+11 if time) | Polish, rehearse, record backup demo video |
| 7:00 AM | **Code freeze** | |
| 7:00–7:45 AM | Submit GitHub repo, pitch deck, prototype | |

**Rule:** anything not working by 3:30 AM gets dropped; polish the pillars instead.

---

## 12. Demo Script (10 min)
| Time | Segment |
|---|---|
| 0:00–1:00 | **Problem + story:** Amma recovering at home, son in another city, nobody correcting her |
| 1:00–2:30 | **D1:** Amma logs in → uploads MRI report → findings in English + Malayalam (read aloud) → suggested knee & shoulder exercises + what to avoid |
| 2:30–3:30 | **D4:** avatar demonstrates each of the 4 exercises |
| 3:30–6:30 | **D2 + D3:** teammate does all 4 exercises live → Malayalam rep counting → deliberate lean / shrug / knee cave → Malayalam correction, rep not counted → session summary |
| 6:30–7:30 | **D3:** push-to-talk, ask in Malayalam ("ഇന്ന് എത്ര ചെയ്യണം?") → spoken Malayalam answer; red-flag question → "contact your doctor" |
| 7:30–9:00 | **D5:** son's phone (separate device) → session summaries appear → download PDF for the doctor |
| 9:00–10:00 | Impact, privacy (video stays on device), future (more body parts, reminders, prescription help, mobile app) |

Keep a recorded backup video and cached AI responses in case of Wi-Fi/API failure.

---

## 13. Judging Talking Points
- **Accessibility:** speaks and listens in Malayalam, elderly-friendly, no wearables
- **Family in the loop:** son on another device sees every session + doctor-ready PDF
- **Personalised:** plan from the patient's own medical report
- **Robust:** multi-API fallback, offline pose tracking, cached voice cues
- **Privacy:** video stays on device; consent-based caregiver access

## 14. Out of Scope
- Diagnosis, prescribing or changing medicine doses
- Interpreting raw MRI images (we read the written report)
- Clinical validation (future: pilot with physiotherapists)
- Everything in §4 Parked, for the demo
