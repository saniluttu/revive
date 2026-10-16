# Revive — AI Avatar-Guided Home Physiotherapy
**She Builds Tech 3.0 (KSUM) — Final Requirements & Build Plan**
Build window: 16 Oct 4:00 PM → 17 Oct 7:00 AM code freeze
Repo: https://github.com/saniluttu/revive

> Rule check: all code must be written during the hackathon. External projects
> (e.g. Physio-Galenus) are reference for ideas only — no copied code.
> Public libraries and APIs are allowed. Commit after every feature.

---

## 1. Core Idea
Elderly and recovering patients doing physiotherapy at home have no one to correct them,
forget their exercises, and their family can't see whether they're improving.

**Revive** reads the patient's medical (MRI) report, suggests the right exercises, shows them
through a **3D avatar**, watches the patient through a webcam/phone (no wearables), **counts reps
and checks form**, talks to them **in Malayalam** ("Hey Revive"), sends **reminders**, and lets
**sons/daughters monitor progress remotely** and download a report for the next doctor visit.

**Pitch line:** *A physiotherapist at home that speaks Malayalam — and keeps the family in the loop.*

---

## 2. Users & Roles
| Role | Can do |
|---|---|
| **Patient** | Login, profile, upload report, do exercises, chat with Revive, set reminders, view progress |
| **Caregiver** (son/daughter) | Link to a patient via invite code, view their progress & analytics live, get alerts (missed session), download report PDF |

Patient must accept the caregiver link (consent).

---

## 3. Feature Priorities
- **P0 — must work in the demo**
- **P1 — build after P0 works**
- **P2 — only if time is left**

| # | Feature | Priority |
|---|---|---|
| F1 | Login / signup (patient & caregiver) | P0 |
| F2 | Patient profile: name, age, condition | P0 |
| F3 | Medical (MRI) report upload → AI analysis → suggested body parts & exercises (skippable) | P0 |
| F4 | Manual body-part & exercise selection | P0 |
| F5 | 3D avatar exercise demonstration | P0 |
| F6 | Live pose tracking, rep counting, form monitoring | P0 |
| F7 | Malayalam voice cues during exercise | P0 |
| F8 | Progress tracking + analytics dashboard | P0 |
| F9 | Caregiver monitoring + downloadable PDF report | P0 |
| F10 | Malayalam chatbot with "Hey Revive" wake word | P1 |
| F11 | Exercise reminders & checkup reminders + notifications | P1 |
| F12 | Fatigue detection | P2 |
| F13 | Prescription upload → Malayalam medicine guide, food to avoid, medicine reminders | P2 |

---

## 4. Functional Requirements

### F1 — Login / Signup (P0)
- Email + password (Firebase Auth); optional Google sign-in
- Choose role at signup: Patient / Caregiver
- Route to Patient Home or Caregiver Dashboard after login

### F2 — Patient Profile (P0)
- Name, age, gender, preferred language (Malayalam / English)
- Pain level slider (0–10) asked before each session

### F3 — Medical Report Analysis (P0)
- Upload PDF or image of the radiologist's **written report** (we read the report text,
  we do not interpret raw MRI scans)
- Vision LLM extracts → JSON:
  `{ diagnosis, affected_body_parts[], severity, restrictions[], recommended_exercise_ids[], reason }`
- LLM may only choose exercise IDs from our library (passed in prompt)
- Shows: findings summary (English + Malayalam), body parts to focus on, suggested exercises
  with reason, exercises to **avoid**
- **"Skip"** button → goes to manual selection (F4)
- Disclaimer on screen: *AI suggestions — follow your doctor/physiotherapist's advice*
- Demo: use our own sample MRI report (keep a cached response as backup if APIs fail)

### F4 — Manual Selection (P0)
- Body map / cards: Shoulder, Knee, Lower back, Neck
- Exercise list per body part with difficulty, reps, sets

**Exercise library (MVP = 4, extend if time):**
| Body part | Exercises | Conditions |
|---|---|---|
| Shoulder | Shoulder abduction, shoulder flexion | Frozen shoulder, rotator cuff |
| Knee | Mini squat, seated knee extension | Osteoarthritis, post-surgery |
| Lower back (P1) | Bridge, cat-cow | Low back pain, disc issues |
| Neck (P1) | Neck side tilt, chin tuck | Cervical spondylosis |

### F5 — 3D Avatar (P0)
- React Three Fiber + rigged GLB character (Ready Player Me / Mixamo)
- Plays the exercise animation on loop; play/pause/slow
- Layout: avatar (left) | patient camera + skeleton (right)
- **Fallback:** animated 2D skeleton from recorded reference landmarks

### F6 — Pose Tracking, Rep Counting, Monitoring (P0)
- MediaPipe Pose Landmarker **in the browser** (free, no rate limits, works offline)
- Skeleton overlay, framing check ("step back, full body not visible")
- Joint angles from landmarks; rep state machine
  `START → UP → TOP → DOWN → START` = 1 rep (only if target ROM reached)
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

### F7 — Malayalam Voice Cues (P0)
- **No LLM per frame.** Pre-generate ~30 cues once with TTS, save as audio files, play from cache:
  rep numbers 1–20, "കൈ കുറച്ചുകൂടി ഉയർത്തുക", "നേരെ നിൽക്കുക", "നന്നായി!", "വിശ്രമിക്കൂ", "സെറ്റ് പൂർത്തിയായി"
- 3-second cooldown per cue; English fallback

### F8 — Progress & Analytics (P0)
- Each session saved: date, exercises, reps, sets, avg quality, wrong-movement count,
  pain before/after, duration
- Dashboard: quality trend line, reps per day bar chart, pain trend, streak counter,
  weekly adherence % (sessions done vs planned)

### F9 — Caregiver Monitoring (P0)
- Patient Home shows an **invite code**; caregiver enters it to link
- Caregiver Dashboard: list of linked patients → same analytics as F8 (read-only), last session time
- Alert badge if no session in 24 h
- **Download PDF report** (jsPDF): patient details, report findings, exercise plan,
  session history, charts, pain trend — for the doctor follow-up

### F10 — Malayalam Chatbot + "Hey Revive" (P1)
- Floating chat button + text/voice chat in Malayalam & English
- Wake word: browser Web Speech API in continuous mode listens for "Hey Revive"
  → chime → records the question in Malayalam (`ml-IN`) → LLM → Malayalam TTS reply
- Works while the Revive tab is open (browser limit — mention in pitch as future mobile app)
- Toggle to turn wake word on/off; mic indicator when listening
- Scope limited to exercises, recovery and app help; knows the patient's plan & progress
- Red flags (chest pain, severe pain, numbness, swelling, fall) → "Stop and contact your doctor"
  + notify caregiver

### F11 — Reminders & Notifications (P1)
- Exercise reminders: daily time(s) per exercise plan
- Checkup reminders: doctor/physio appointment date & time
- Browser notifications (Notification API + service worker) + in-app notification list
- Caregiver notified on missed sessions
- Upgrade path: Firebase Cloud Messaging for push when app is closed

### F12 — Fatigue Detection (P2)
- Compare last 3 reps vs first 3: rep time ↑ > 30%, ROM ↓ > 15%, jitter ↑
- Fatigue meter; if fatigue high AND wrong movements rising → "You're tired, take a 30-second rest"

### F13 — Prescription Assistant (P2)
- Upload prescription image → LLM extracts medicines, dosage, timing
- For each medicine in Malayalam: what it's for, when/how to take, **foods/drinks to avoid**,
  common side effects
- Auto-create medicine reminders from the dosage schedule
- Disclaimer: *General information — confirm with your doctor or pharmacist.*
  Show "Couldn't read clearly" instead of guessing when text is unclear.

---

## 5. Multi-API Fallback Router
Backend module `llmRouter` — every AI call goes through it.

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
| Report / prescription reading (vision) | Gemini | OpenRouter vision model |
| Chatbot | Groq | Gemini → OpenRouter |
| Malayalam TTS | Sarvam AI / Google Cloud TTS (ml-IN) | Browser speechSynthesis |
| Malayalam STT | Browser Web Speech (ml-IN) | Groq Whisper / Sarvam |

Pose tracking never goes to an API.

---

## 6. Non-Functional Requirements
- Works on laptop webcam and phone browser (responsive, large text & buttons for elderly users)
- Form-cue latency < 300 ms
- Video never leaves the device; only report/prescription images and chat text go to AI APIs
- Medical disclaimer on report, chatbot and prescription screens
- Malayalam + English UI toggle

---

## 7. Tech Stack
- **Frontend:** React + Vite + Tailwind, React Router
- **Pose:** `@mediapipe/tasks-vision`
- **Avatar:** three, `@react-three/fiber`, `@react-three/drei`
- **Charts:** Recharts  **PDF:** jsPDF + html2canvas
- **Auth / DB / Storage:** Firebase (Auth, Firestore, Storage)
- **Backend:** Node + Express (LLM router, report/prescription parsing, TTS) — keeps API keys hidden
- **Notifications:** Notification API + service worker (FCM if time)

### Firestore collections
- `users/{uid}` — role, name, age, language, inviteCode
- `links/{id}` — patientUid, caregiverUid, status
- `reports/{id}` — patientUid, extracted JSON, createdAt
- `plans/{patientUid}` — exercises, reps, sets, schedule
- `sessions/{id}` — patientUid, exercise, reps, quality, wrongMoves, painBefore, painAfter, duration, date
- `reminders/{id}` — patientUid, type (exercise/checkup/medicine), time, repeat
- `prescriptions/{id}` — patientUid, medicines[] (P2)

---

## 8. Screens
1. Login / Signup (role select)
2. Patient profile setup
3. Report upload → AI analysis results (or Skip)
4. Body-part & exercise selection
5. **Live session** — avatar | camera + skeleton | reps | quality | correction text
6. Session summary
7. Progress & analytics
8. Reminders & notifications
9. Caregiver dashboard + PDF download
10. Chatbot (floating, "Hey Revive")
11. Prescription assistant (P2)

---

## 9. Build Phases (for Claude Code — one phase at a time, commit after each)
1. **Setup:** Vite + React + Tailwind + Router + Firebase config; Express backend skeleton; `.env.example`
2. **Auth & profile:** F1, F2
3. **Pose core:** MediaPipe skeleton on webcam + live angle readout
4. **Exercises:** library, manual selection (F4), rep counting + form rules (F6)
5. **Voice cues:** generate Malayalam cue pack, play during session (F7)
6. **Report analysis:** llmRouter + upload → JSON → suggestions (F3)
7. **Avatar:** GLB model + exercise animations, side-by-side layout (F5)
8. **Progress:** save sessions, analytics dashboard (F8)
9. **Caregiver:** invite link, dashboard, PDF report (F9)
10. **Chatbot + Hey Revive** (F10)
11. **Reminders & notifications** (F11)
12. **Fatigue** (F12), **Prescription assistant** (F13)
13. Polish, Malayalam UI strings, demo data, bug fixes

---

## 10. Timeline Aligned to Checkpoints
| Time | Target | Show at checkpoint |
|---|---|---|
| till 6:30 PM | Phases 1–3 | **Mentor Checkpoint I:** login + live skeleton, this plan, architecture |
| 8:15–11:30 PM | Phases 4–6 | **Progress Checkpoint:** rep counting + wrong-movement alert + Malayalam cues + report analysis |
| 12:00–3:30 AM | Phases 7–9 | **Mentor Checkpoint II:** full patient flow + caregiver dashboard + PDF |
| 3:30–6:30 AM | Phases 10–13 | Chatbot, reminders, polish, record backup demo video |
| 7:00 AM | **Code freeze** | |
| 7:00–7:45 AM | Submit GitHub repo, pitch deck, prototype | |

**Rule:** anything not working by 3:30 AM gets dropped; polish P0 instead.

---

## 11. Demo Script (3 min — confirm duration with organisers)
1. (15 s) Problem: elderly patients, home physio done wrong, family can't track
2. (25 s) Login → upload our MRI report → AI shows findings + suggested knee/shoulder exercises
3. (50 s) Avatar demonstrates → teammate does reps → Malayalam counting → teammate leans
   deliberately → "നേരെ നിൽക്കുക" correction
4. (20 s) "Hey Revive" → Malayalam question → Malayalam answer
5. (30 s) Switch to caregiver (daughter) login → sees progress live → downloads PDF for doctor
6. (20 s) Reminders, impact, future (mobile app, therapist portal, more conditions)

Keep a recorded backup video and cached AI responses in case of Wi-Fi/API failure.

---

## 12. Judging Talking Points
- **Accessibility:** Malayalam voice + "Hey Revive", elderly-friendly, no wearables
- **Family in the loop:** caregiver monitoring + doctor-ready PDF report
- **Personalised:** plan from the patient's own medical report
- **Robust:** multi-API fallback, offline pose tracking, cached voice cues
- **Privacy:** video stays on device; consent-based caregiver access

## 13. Out of Scope
- Diagnosis, prescribing or changing medicine doses
- Interpreting raw MRI images (we read the written report)
- Clinical validation (future: pilot with physiotherapists)
