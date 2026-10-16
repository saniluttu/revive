// Voice cue pack generator: order, skipping, throttling and rate-limit retries,
// with a fake Sarvam and a fake clock (no real waiting).
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { generateCues, retryDelayMs } from '../src/voice/cueGenerator.js'
import { parseRetryAfter } from '../src/voice/sarvam.js'

const TEXTS = {
  ml: { 'rep-1': 'ഒന്ന്', 'rep-2': 'രണ്ട്' },
  en: { 'rep-1': 'One', 'rep-2': 'Two' },
}

const httpError = (status, retryAfterMs) => Object.assign(new Error(`HTTP ${status}`), { status, retryAfterMs })

/** Fake Sarvam: `script` is a list of errors to throw before succeeding (per call order). */
function setup({ script = [], texts = TEXTS, outDir = mkdtempSync(path.join(tmpdir(), 'cues-')) } = {}) {
  const calls = []
  const waits = []
  const lines = []
  const queue = [...script]
  return {
    outDir,
    calls,
    waits,
    lines,
    run: (extra = {}) =>
      generateCues({
        langs: ['ml', 'en'],
        textsByLang: texts,
        outDir,
        delayMs: 1500,
        sleep: async (ms) => waits.push(ms),
        log: (line) => lines.push(line),
        tts: async (text, lang) => {
          calls.push(`${lang}:${text}`)
          const next = queue.shift()
          if (next) throw next
          return Buffer.from(`mp3 ${text}`)
        },
        ...extra,
      }),
  }
}

const manifest = (dir) => JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))

describe('generateCues', () => {
  test('Malayalam first, one request at a time, 1500 ms apart', async () => {
    const t = setup()
    const summary = await t.run()
    assert.deepEqual(t.calls, ['ml:ഒന്ന്', 'ml:രണ്ട്', 'en:One', 'en:Two'])
    assert.deepEqual(t.waits, [1500, 1500, 1500]) // between requests, not before the first
    assert.deepEqual(summary.ml, { generated: 2, skipped: 0, failed: [] })
    assert.equal(readFileSync(path.join(t.outDir, 'ml/rep-1.mp3'), 'utf8'), 'mp3 ഒന്ന്')
    assert.deepEqual(manifest(t.outDir).cues.ml['rep-2'], { file: 'ml/rep-2.mp3', text: 'രണ്ട്' })
  })

  test('reruns skip existing files; --force regenerates them', async () => {
    const t = setup()
    await t.run()
    t.calls.length = 0
    const again = await t.run()
    assert.equal(t.calls.length, 0)
    assert.deepEqual(again.en, { generated: 0, skipped: 2, failed: [] })
    const forced = await t.run({ force: true })
    assert.equal(t.calls.length, 4)
    assert.equal(forced.ml.generated, 2)
  })

  test('a file left by an interrupted run (no manifest entry) is kept and recorded', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cues-'))
    mkdirSync(path.join(outDir, 'ml'))
    writeFileSync(path.join(outDir, 'ml/rep-1.mp3'), 'earlier')
    const t = setup({ outDir })
    const summary = await t.run()
    assert.equal(summary.ml.skipped, 1)
    assert.ok(!t.calls.includes('ml:ഒന്ന്'))
    assert.equal(manifest(outDir).cues.ml['rep-1'].text, 'ഒന്ന്')
  })

  test('a reworded cue is regenerated even though its file exists', async () => {
    const t = setup()
    await t.run()
    t.calls.length = 0
    await t.run({ textsByLang: { ...TEXTS, en: { 'rep-1': 'One!', 'rep-2': 'Two' } } })
    assert.deepEqual(t.calls, ['en:One!'])
  })

  test('429 without Retry-After backs off 15 s → 30 s → 60 s, then succeeds', async () => {
    const t = setup({ script: [httpError(429), httpError(429), httpError(429)] })
    const summary = await t.run()
    assert.deepEqual(t.waits.slice(0, 3), [15_000, 30_000, 60_000])
    assert.equal(summary.ml.generated, 2)
    assert.ok(t.lines.some((l) => /rate limited; waiting 15 s \(try 2\/5\)/.test(l)))
  })

  test('429 with Retry-After waits what the server asks', async () => {
    const t = setup({ script: [httpError(429, 7_000)] })
    await t.run()
    assert.equal(t.waits[0], 7_000)
  })

  test('after 5 tries a cue is given up and the next one is generated', async () => {
    const t = setup({ script: Array.from({ length: 5 }, () => httpError(429)) })
    const summary = await t.run()
    assert.deepEqual(summary.ml, { generated: 1, skipped: 0, failed: ['rep-1'] })
    assert.equal(t.calls.filter((c) => c === 'ml:ഒന്ന്').length, 5)
    assert.ok(!existsSync(path.join(t.outDir, 'ml/rep-1.mp3')))
    assert.equal(manifest(t.outDir).cues.ml['rep-1'], undefined)
    // a rerun fills just that gap
    t.calls.length = 0
    const rerun = await t.run()
    assert.deepEqual(t.calls, ['ml:ഒന്ന്'])
    assert.deepEqual(rerun.ml, { generated: 1, skipped: 1, failed: [] })
  })

  test('a rejected API key stops the run at once', async () => {
    const t = setup({ script: [httpError(401)] })
    const summary = await t.run()
    assert.match(summary.aborted, /SARVAM_API_KEY/)
    assert.equal(t.calls.length, 1)
    assert.equal(summary.en, undefined)
  })
})

describe('retryDelayMs', () => {
  test('rate limits, server errors and errors not worth retrying', () => {
    assert.deepEqual([0, 1, 2, 3].map((a) => retryDelayMs(httpError(429), a)), [15_000, 30_000, 60_000, 60_000])
    assert.equal(retryDelayMs(httpError(429), 4), null) // 5 tries used
    assert.equal(retryDelayMs(httpError(429, 2_000), 0), 2_000)
    assert.equal(retryDelayMs(httpError(429, 3_600_000), 0), 300_000) // capped at 5 min
    assert.equal(retryDelayMs(httpError(503), 0), 2_000)
    assert.equal(retryDelayMs(new Error('fetch failed'), 1), 5_000)
    assert.equal(retryDelayMs(httpError(400), 0), null)
  })

  test('Retry-After header: seconds or an HTTP date', () => {
    assert.equal(parseRetryAfter('12'), 12_000)
    assert.equal(parseRetryAfter(new Date(10_000 + 30_000).toUTCString(), 10_000), 30_000)
    assert.equal(parseRetryAfter(null), null)
    assert.equal(parseRetryAfter('soon'), null)
  })
})
