# Revive

AI-powered, avatar-guided home physiotherapy that speaks Malayalam and keeps the family in the loop.
Built for **She Builds Tech 3.0 (KSUM)**. See [REQUIREMENTS.md](REQUIREMENTS.md) for the full plan.

## Project structure

```
client/   React + Vite + Tailwind frontend (pose tracking runs in the browser)
server/   Node + Express backend (LLM router, keeps API keys hidden)
```

## Prerequisites

- Node.js 20+ and npm
- A webcam (laptop or phone) for the Live Session screen

## Run locally

### 1. Backend (port 5000)

```bash
cd server
npm install
cp .env.example .env   # add your Gemini / Groq / OpenRouter keys
npm run dev
```

Check it's running: <http://localhost:5000/api/health>

### 2. Frontend (port 5173)

```bash
cd client
npm install            # also copies the MediaPipe WASM into public/mediapipe
cp .env.example .env   # optional: add Firebase web config
npm run dev
```

Open <http://localhost:5173>. The dev server listens on `0.0.0.0`, so other devices on
the same network can use the **Network** URL printed in the terminal.
Requests to `/api/*` are proxied to the backend on port 5000.

> **Camera on a phone:** browsers only allow webcam access on `https://` or `localhost`.
> To test on a phone, use a tunnel (e.g. `npx localtunnel --port 5173` or ngrok) or
> enable Chrome's "Insecure origins treated as secure" flag for your laptop's IP.

## Environment variables

**server/.env**

| Variable | Description |
|---|---|
| `PORT` | Backend port (default 5000) |
| `CLIENT_ORIGIN` | Allowed CORS origin(s), comma-separated |
| `GEMINI_API_KEYS` | One or more Gemini keys, comma-separated |
| `GROQ_API_KEYS` | One or more Groq keys, comma-separated |
| `OPENROUTER_API_KEYS` | One or more OpenRouter keys, comma-separated |
| `*_MODEL` | Optional model overrides |

**client/.env**: `VITE_FIREBASE_*` values from Firebase console → Project settings.
The app runs without them; Firebase features are disabled until they're set.

`.env` files are git-ignored. Never commit real keys.

## How the pieces work

- **Pose tracking:** `@mediapipe/tasks-vision` Pose Landmarker runs fully in the browser
  (`client/src/pose/`). Video never leaves the device.
- **Rep counting:** `client/src/exercises/repCounter.js` turns each frame into one
  range-of-motion number per exercise (`library.js`) and runs
  `START → UP → TOP → DOWN → START`; a rep counts only if the target was reached.
  Form rules from REQUIREMENTS.md F6 live in `rules.js`. Each rep gets a 0–100 score:
  40 range of motion + 30 smoothness + 30 form.
  A rep is shown as *not counted* if the exercise's main compensation (e.g. shoulder
  shrug) is active as the target is crossed (abduction) or held for most of the rep. Run the tests with `cd client && npm test`.
- **LLM router:** `server/src/llm/llmRouter.js` tries Gemini, Groq and OpenRouter in order
  for each task. A key that hits a 429, timeout or 5xx cools down for 60 s and the router
  moves to the next one. If every provider fails, it returns a cached response.
- **Models:** every model name is an env var (`server/.env.example`). At startup
  `server/src/llm/models.js` checks them against each provider's model list and logs what
  it chose: OpenRouter auto-picks **free** models only (never a paid one), Groq is used for
  report images only if it has a vision model, and a missing Gemini/Groq model is replaced
  with a current one. A 404 at request time logs which env var to change. See the chosen
  models at `/api/health`.
- **Report analysis (F3):** the Report page posts the PDF/photo to `POST /api/report/analyze`
  (`server/src/routes/report.js`). The vision task goes to Gemini, then Groq (images only, if
  it has a vision model), then OpenRouter. Replies are validated in `server/src/report/analysis.js`: only body parts and
  exercise IDs from our library survive, and an invalid reply makes the router try the next
  provider. Gemini is retried on 503 "high demand" / 429 (after 2 s, then 5 s), then its
  fallback model (`GEMINI_FALLBACK_MODEL`, or another current flash / flash-lite picked at
  startup) gets the same treatment, before Groq / OpenRouter. The page streams progress and shows
  "trying again" meanwhile. Each good result is saved in `server/cache/` (git-ignored) by file
  hash: the same file is answered instantly next time, and a saved answer is served if every
  provider fails. **For the demo:** analyse the demo report once, then set `DEMO_MODE=true` so
  known files always come from the cache (even after prompt changes). Run the server tests
  with `cd server && npm test`.

## Build status

- [x] Phase 1: Setup (client, server, Firebase config, LLM router skeleton)
- [x] Phase 2: Auth & profile (local authService; Firebase Auth swap pending)
- [x] Phase 3: Pose core (skeleton overlay + live joint angles)
- [x] Phase 4: Exercise library, body-part selection, rep counting + form rules + quality score
- [ ] Phases 5–13: see REQUIREMENTS.md §9
