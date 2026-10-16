// Pre-generates the Live Session's spoken cues (F7) and every exercise's
// read-aloud instructions (intro, steps, key tip) with Sarvam TTS:
//   client/public/audio/{ml,en}/<cue id>.mp3  +  client/public/audio/manifest.json
//
//   npm run voice-cues            (from server/; needs SARVAM_API_KEY in server/.env)
//   npm run voice-cues -- --force (regenerate everything)
//
// Cue text comes from client/src/i18n/{en,ml}.json (see client/src/voice/cues.js).
// Only cues whose text changed or whose file is missing are generated again.
// The client plays a cue only if the manifest's text matches the current
// translation; otherwise it falls back to the browser's speechSynthesis.

import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUE_LANGS, cueTexts } from '../../client/src/voice/cues.js'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(here, '..', '.env'), quiet: true })
const { isConfigured, textToSpeech } = await import('../src/voice/sarvam.js')

const CLIENT = path.join(here, '..', '..', 'client')
const OUT_DIR = path.join(CLIENT, 'public', 'audio')
const MANIFEST = path.join(OUT_DIR, 'manifest.json')
const SARVAM_LANG = { en: 'en-IN', ml: 'ml-IN' }
const RETRY_DELAYS_MS = [2000, 5000]

const force = process.argv.includes('--force')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function speak(text, lang) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await textToSpeech({ text, lang, codec: 'mp3' })
    } catch (err) {
      const retryable = err.status === 429 || err.status >= 500 || !err.status
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw err
      console.warn(`  retrying in ${RETRY_DELAYS_MS[attempt]} ms (${err.message.slice(0, 100)})`)
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
}

if (!isConfigured()) {
  console.error('SARVAM_API_KEY is not set in server/.env — cannot generate voice cues.')
  process.exit(1)
}

const old = await readJson(MANIFEST, { cues: {} })
const manifest = {
  generatedAt: new Date().toISOString(),
  model: process.env.SARVAM_TTS_MODEL?.trim() || 'bulbul:v3',
  cues: {},
}
let made = 0
let kept = 0
let failed = 0
const perLang = {}

for (const lang of CUE_LANGS) {
  const dict = await readJson(path.join(CLIENT, 'src', 'i18n', `${lang}.json`))
  const texts = cueTexts(dict)
  await mkdir(path.join(OUT_DIR, lang), { recursive: true })
  manifest.cues[lang] = {}
  console.log(`${lang}: ${Object.keys(texts).length} cues`)

  for (const [id, text] of Object.entries(texts)) {
    const file = `${lang}/${id}.mp3`
    const previous = old.cues?.[lang]?.[id]
    if (!force && previous?.text === text && existsSync(path.join(OUT_DIR, file))) {
      manifest.cues[lang][id] = previous
      kept++
      continue
    }
    try {
      const { audio } = await speak(text, SARVAM_LANG[lang])
      await writeFile(path.join(OUT_DIR, file), audio)
      manifest.cues[lang][id] = { file, text }
      made++
      console.log(`  ${file}  "${text}"`)
    } catch (err) {
      failed++
      console.error(`  FAILED ${file}: ${err.message}`)
    }
  }
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
for (const lang of CUE_LANGS) perLang[lang] = Object.keys(manifest.cues[lang]).length
console.log(`Voice cues: ${made} generated, ${kept} unchanged, ${failed} failed → ${path.relative(process.cwd(), MANIFEST)}`)
console.log(`In the pack: ${CUE_LANGS.map((l) => `${l} ${perLang[l]}`).join(', ')}`)
if (!failed) console.log('Commit client/public/audio so every machine has the cues without a Sarvam key.')
if (failed) process.exit(1)
