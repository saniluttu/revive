// Voice cue pack generation (used by scripts/generate-voice-cues.js), written so it
// survives Sarvam's free-tier rate limit:
//   - files that already exist are skipped (reruns only fill gaps; `force` redoes all)
//   - one request at a time, `delayMs` apart
//   - 429: wait Retry-After if given, else 15 s → 30 s → 60 s (→ 60 s), up to 5 tries,
//     then move on to the next cue; 5xx / network errors get the same 5 tries, shorter waits
//   - the manifest is saved after every cue, so an interrupted run keeps its progress
// `tts`, `sleep` and `log` are injectable for tests.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_TRIES = 5
export const RATE_LIMIT_BACKOFF_MS = [15_000, 30_000, 60_000]
const SERVER_ERROR_BACKOFF_MS = [2_000, 5_000, 10_000]
const MAX_RETRY_AFTER_MS = 5 * 60_000

/**
 * How long to wait before try number `attempt + 1`, or null if this error isn't worth retrying.
 * @param err     error from tts (status, retryAfterMs)
 * @param attempt 0-based index of the try that just failed
 */
export function retryDelayMs(err, attempt) {
  if (attempt + 1 >= MAX_TRIES) return null
  const pick = (list) => list[Math.min(attempt, list.length - 1)]
  if (err.status === 429) return err.retryAfterMs != null ? Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS) : pick(RATE_LIMIT_BACKOFF_MS)
  if (!err.status || err.status >= 500) return pick(SERVER_ERROR_BACKOFF_MS)
  return null // 400 (bad text), 401/403 (bad key)…: retrying won't help
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

const seconds = (ms) => `${Math.round(ms / 100) / 10} s`

/**
 * @param opts.langs       languages in the order to generate them (priority first)
 * @param opts.textsByLang { [lang]: { [cueId]: text } }
 * @param opts.outDir      client/public/audio
 * @param opts.tts         (text, lang) → Promise<Buffer> (mp3)
 * @param opts.force       regenerate files that already exist
 * @param opts.delayMs     pause between requests
 * @returns {Promise<{ [lang]: { generated: number, skipped: number, failed: string[] }, aborted?: string }>}
 */
export async function generateCues({
  langs,
  textsByLang,
  outDir,
  tts,
  force = false,
  delayMs = 1500,
  model = '',
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
}) {
  const manifestFile = path.join(outDir, 'manifest.json')
  const old = await readJson(manifestFile, { cues: {} })
  // Keep entries only for cues that still exist; filled in below
  const manifest = { generatedAt: new Date().toISOString(), model, cues: {} }
  for (const lang of Object.keys(old.cues ?? {})) if (!langs.includes(lang)) manifest.cues[lang] = old.cues[lang]
  const save = () => writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)

  const summary = {}
  let requests = 0

  for (const lang of langs) {
    const texts = textsByLang[lang]
    const stats = (summary[lang] = { generated: 0, skipped: 0, failed: [] })
    manifest.cues[lang] = {}
    await mkdir(path.join(outDir, lang), { recursive: true })
    log(`\n${lang}: ${Object.keys(texts).length} cues`)

    for (const [id, text] of Object.entries(texts)) {
      const file = `${lang}/${id}.mp3`
      const previous = old.cues?.[lang]?.[id]
      // An existing file is kept unless its recorded text is different (the cue was reworded).
      // A file with no manifest entry comes from an interrupted run of the same text.
      if (!force && existsSync(path.join(outDir, file)) && (!previous || previous.text === text)) {
        manifest.cues[lang][id] = { file, text }
        stats.skipped++
        continue
      }

      let audio = null
      for (let attempt = 0; ; attempt++) {
        if (requests++ > 0 && attempt === 0) await sleep(delayMs) // retries already waited
        try {
          audio = await tts(text, lang)
          break
        } catch (err) {
          const wait = retryDelayMs(err, attempt)
          const why = err.status ? `HTTP ${err.status}` : err.message
          if (err.status === 401 || err.status === 403) {
            summary.aborted = `Sarvam refused the API key (${why}) — check SARVAM_API_KEY in server/.env`
            stats.failed.push(id)
            await save()
            return summary
          }
          if (wait == null) {
            log(`  ✗ ${file} — ${why}, giving up on this cue (try ${attempt + 1}/${MAX_TRIES})`)
            break
          }
          const reason = err.status === 429 ? `rate limited${err.retryAfterMs != null ? ', Retry-After' : ''}` : why
          log(`  … ${file} — ${reason}; waiting ${seconds(wait)} (try ${attempt + 2}/${MAX_TRIES})`)
          await sleep(wait)
        }
      }

      if (!audio) {
        stats.failed.push(id)
        continue
      }
      await writeFile(path.join(outDir, file), audio)
      manifest.cues[lang][id] = { file, text }
      stats.generated++
      await save()
      log(`  ✓ ${file}  "${text}"`)
    }
    await save()
  }
  return summary
}
