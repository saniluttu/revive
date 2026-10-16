// End-to-end: POST /api/report/analyze with provider HTTP calls stubbed.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'

process.env.REPORT_CACHE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'revive-')), 'cache.json')
process.env.GEMINI_API_KEYS = 'g1'
process.env.OPENROUTER_API_KEYS = 'o1'
process.env.GROQ_API_KEYS = 'q1'
process.env.GEMINI_MODEL = 'gemini-main'
process.env.GEMINI_FALLBACK_MODEL = 'gemini-backup'
process.env.GEMINI_RETRY_DELAYS_MS = '1,1'
process.env.OPENROUTER_MODEL = 'free/text:free'
process.env.OPENROUTER_VISION_MODEL = 'free/vision:free'
delete process.env.DEMO_MODE

const express = (await import('express')).default
const reportRouter = (await import('../src/routes/report.js')).default
const { saveCached, hashFile } = await import('../src/report/cache.js')

const analysis = {
  diagnosis: 'Early knee osteoarthritis',
  affected_body_parts: ['knee'],
  severity: 'mild',
  restrictions: [],
  recommended_exercise_ids: ['mini-squat', 'made-up-exercise'],
  avoid: [],
  reason: { en: 'Strengthens the thigh', ml: 'തുട ബലപ്പെടുത്തുന്നു' },
  summary_en: 'Mild wear in the knee.',
  summary_ml: 'മുട്ടിൽ ചെറിയ തേയ്മാനം.',
}

const realFetch = globalThis.fetch
let mode = 'ok' // ok | gemini503 | allDown
let calls = []
beforeEach(() => {
  calls = []
})

globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, opts)
  calls.push(String(url))
  if (String(url).includes('generativelanguage')) {
    if (mode === 'gemini503' || mode === 'allDown') return new Response('model is experiencing high demand', { status: 503 })
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] })
  }
  if (String(url).includes('openrouter') && mode !== 'allDown') {
    return Response.json({ choices: [{ message: { content: JSON.stringify(analysis) } }] })
  }
  return new Response('quota', { status: 429 })
}

let server, base
before(async () => {
  const app = express()
  app.use(express.json({ limit: '15mb' }))
  app.use('/api/report', reportRouter)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/api/report/analyze`
})
after(() => server.close())

const post = (file, headers = {}) =>
  realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ file }) })
const postStream = async (file) => {
  const res = await post(file, { Accept: 'application/x-ndjson' })
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const png = (label) => {
  const bytes = Buffer.concat([PNG, Buffer.from(label)])
  return { file: { name: `${label}.png`, mimeType: 'image/png', data: bytes.toString('base64') }, hash: hashFile(bytes) }
}
const geminiCalls = (model) => calls.filter((u) => u.includes(`models/${model}:`)).length

test('rejects unsupported files', async () => {
  const res = await post({ name: 'x.txt', mimeType: 'text/plain', data: 'aGk=' })
  assert.equal(res.status, 400)
})

test('Gemini answers; invalid exercise ids are dropped; same file again is served from the cache instantly', async () => {
  const { file } = png('A')
  const body = await (await post(file)).json()
  assert.equal(body.provider, 'gemini')
  assert.equal(body.cached, undefined)
  assert.deepEqual(body.analysis.recommended_exercise_ids, ['mini-squat'])

  calls = []
  const again = await (await post(file)).json()
  assert.equal(again.cached, true)
  assert.equal(again.provider, 'gemini')
  assert.equal(calls.length, 0, 'no AI call for a known file')
})

test('Gemini 503: 2 retries, then the fallback model (2 retries), then OpenRouter — progress is streamed', async () => {
  mode = 'gemini503'
  const lines = await postStream(png('B').file)
  assert.equal(geminiCalls('gemini-main'), 3)
  assert.equal(geminiCalls('gemini-backup'), 3)
  assert.ok(!calls.some((u) => u.includes('groq')), 'Groq has no vision model here')
  const retrying = lines.filter((l) => l.type === 'retrying')
  assert.equal(retrying.length, 6) // 5 Gemini retries/fallbacks + the move to OpenRouter
  assert.deepEqual(lines.at(-1).provider, 'openrouter')
  assert.equal(lines.at(-1).type, 'result')
})

test('a cached answer from an older prompt is redone, but served if every provider fails', async () => {
  const stale = png('C')
  await saveCached(stale.hash, { analysis: { ...analysis, diagnosis: 'old' }, provider: 'gemini', promptVersion: 'old' })

  mode = 'ok'
  let body = await (await post(stale.file)).json()
  assert.notEqual(body.analysis.diagnosis, 'old')
  assert.equal(body.cached, undefined)

  const stale2 = png('D')
  await saveCached(stale2.hash, { analysis: { ...analysis, diagnosis: 'old' }, provider: 'gemini', promptVersion: 'old' })
  mode = 'allDown'
  body = await (await post(stale2.file)).json()
  assert.equal(body.cached, true)
  assert.equal(body.analysis.diagnosis, 'old')
  assert.ok(body.message)
})

test('DEMO_MODE serves any cached answer for a known file without calling the AI', async () => {
  const stale = png('E')
  await saveCached(stale.hash, { analysis: { ...analysis, diagnosis: 'demo' }, provider: 'openrouter', promptVersion: 'old' })
  mode = 'ok'
  process.env.DEMO_MODE = 'true'
  try {
    const body = await (await post(stale.file)).json()
    assert.equal(body.analysis.diagnosis, 'demo')
    assert.equal(body.cached, true)
    assert.equal(calls.length, 0)
  } finally {
    delete process.env.DEMO_MODE
  }
})

test('unknown file with every provider down → ai_unavailable (503, or a streamed error line)', async () => {
  mode = 'allDown'
  assert.equal((await post(png('F').file)).status, 503)
  const lines = await postStream(png('G').file)
  assert.deepEqual(lines.at(-1), { type: 'error', error: 'ai_unavailable' })
})
