// Pre-generates the Live Session's spoken cues (F7) and every exercise's
// read-aloud instructions (intro, steps, key tip) with Sarvam TTS:
//   client/public/audio/{ml,en}/<cue id>.mp3  +  client/public/audio/manifest.json
//
//   npm run voice-cues               (from server/; needs SARVAM_API_KEY in server/.env)
//   npm run voice-cues -- --force    (regenerate files that already exist)
//
// Malayalam first, then English. Files that already exist are skipped, so after a
// rate limit just run it again to fill the gaps. One request at a time,
// VOICE_CUE_DELAY_MS apart (default 1500); see src/voice/cueGenerator.js for retries.
// Cue text comes from client/src/i18n/{en,ml}.json (see client/src/voice/cues.js);
// the client plays a file only while the manifest's text matches the current text.

import dotenv from 'dotenv'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cueTexts } from '../../client/src/voice/cues.js'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(here, '..', '.env'), quiet: true })
const { isConfigured, textToSpeech } = await import('../src/voice/sarvam.js')
const { generateCues } = await import('../src/voice/cueGenerator.js')

const CLIENT = path.join(here, '..', '..', 'client')
const OUT_DIR = path.join(CLIENT, 'public', 'audio')
const LANGS = ['ml', 'en'] // Malayalam is the priority
const SARVAM_LANG = { en: 'en-IN', ml: 'ml-IN' }

if (!isConfigured()) {
  console.error('SARVAM_API_KEY is not set in server/.env — cannot generate voice cues.')
  process.exit(1)
}

const force = process.argv.includes('--force')
const delayMs = Number(process.env.VOICE_CUE_DELAY_MS ?? 1500)
const textsByLang = {}
for (const lang of LANGS) {
  textsByLang[lang] = cueTexts(JSON.parse(await readFile(path.join(CLIENT, 'src', 'i18n', `${lang}.json`), 'utf8')))
}

console.log(`Voice cues → ${path.relative(process.cwd(), OUT_DIR)} (${force ? 'regenerating all' : 'filling gaps'}, ${delayMs} ms between requests)`)
const summary = await generateCues({
  langs: LANGS,
  textsByLang,
  outDir: OUT_DIR,
  force,
  delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1500,
  model: process.env.SARVAM_TTS_MODEL?.trim() || 'bulbul:v3',
  tts: async (text, lang) => (await textToSpeech({ text, lang: SARVAM_LANG[lang], codec: 'mp3' })).audio,
})

console.log('\nSummary')
let failed = 0
for (const lang of LANGS) {
  const s = summary[lang]
  if (!s) {
    console.log(`  ${lang}: not started`)
    continue
  }
  failed += s.failed.length
  console.log(`  ${lang}: ${s.generated} generated, ${s.skipped} skipped (already there), ${s.failed.length} failed`)
  if (s.failed.length) console.log(`      failed: ${s.failed.join(', ')}`)
}
if (summary.aborted) {
  console.error(`\nStopped: ${summary.aborted}`)
  process.exit(1)
}
if (failed) {
  console.log('\nSome cues failed — rerun to fill the gaps: npm run voice-cues')
  process.exit(1)
}
console.log('\nAll cues are in place. Commit client/public/audio, and restart `npm run dev` if it is running.')
