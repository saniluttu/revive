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
| `SARVAM_API_KEY` | Sarvam AI key for voice: text-to-speech, speech-to-text, cue pack |
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
  (`server/src/routes/report.js`). **Text first:** the server extracts the report text locally
  (`server/src/report/extractText.js`): a PDF's text layer via pdfjs-dist, or OCR with
  tesseract.js (eng + mal) for photos and scanned PDFs (pages rendered with @napi-rs/canvas).
  Only that text goes to the LLM, as a `report` task: Groq `openai/gpt-oss-120b` → Gemini (retried
  on 503/429 after 2 s and 5 s, then its fallback model) → OpenRouter free text models, all in JSON
  mode. An invalid reply is re-asked once, then the next model is tried. The file goes to a vision
  model only if no text could be extracted. Replies are validated in `server/src/report/analysis.js`
  (only our body parts and exercise IDs survive). The log shows extraction method, char count and
  which provider answered. Each good result is saved in `server/cache/` (git-ignored) by file hash:
  the same file is answered instantly next time, and a saved answer is served if every provider
  fails. **For the demo:** analyse the demo report once, then set `DEMO_MODE=true` so known files
  always come from the cache. The first OCR run downloads the language data (~11 MB) into
  `server/cache/tessdata`. Test files: `node test/helpers/write-fixtures.js <dir>`. Run the server
  tests with `cd server && npm test`.
- **Voice (F7, F10):** Sarvam AI behind `POST /api/tts` (`{ text, lang: ml-IN|en-IN }` → MP3,
  `bulbul:v3`) and `POST /api/stt?lang=&provider=sarvam|groq` (raw audio → `{ text }`, `saaras:v4`,
  Groq Whisper as the second server engine). If TTS fails the browser's `speechSynthesis` speaks.
  Speech-to-text order: Sarvam → the browser's Web Speech transcript (recorded alongside) →
  Groq Whisper. **Cue pack:** `cd server && npm run voice-cues` pre-generates every Live Session
  cue (rep numbers 1–20, one correction per form rule, well done, rest, set complete, not counted,
  go higher) in Malayalam and English into `client/public/audio/{ml,en}/` + `manifest.json`, from the
  text in `en.json` / `ml.json`; re-run it after changing that text (only changed cues are redone,
  `--force` redoes all). The session plays the pack from memory (no API calls), in the UI language,
  with a 3 s cooldown per cue; a cue missing from the pack is spoken by `speechSynthesis`.
- **Voice questions (F10):** the mic on Home and Live Session records → speech-to-text →
  `POST /api/chat` (llmRouter `chat` task; knows the current exercise and the approved plan;
  exercises only). Red-flag symptoms (chest pain, severe pain, numbness, swelling, a fall…) are
  caught in `server/src/voice/redFlags.js` before the AI and answered "stop and contact your
  doctor". The reply is shown and spoken.

## Build status

- [x] Phase 1: Setup (client, server, Firebase config, LLM router skeleton)
- [x] Phase 2: Auth & profile (local authService; Firebase Auth swap pending)
- [x] Phase 3: Pose core (skeleton overlay + live joint angles)
- [x] Phase 4: Exercise library, body-part selection, rep counting + form rules + quality score
- [ ] Phases 5–13: see REQUIREMENTS.md §9
