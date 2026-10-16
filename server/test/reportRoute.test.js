// End-to-end: POST /api/report/analyze on real files, with provider HTTP calls stubbed.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { reportImage, textPdf } from './helpers/fixtures.js'

process.env.REPORT_CACHE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'revive-')), 'cache.json')
process.env.GEMINI_API_KEYS = 'g1'
process.env.OPENROUTER_API_KEYS = 'o1'
process.env.GROQ_API_KEYS = 'q1'
process.env.GEMINI_MODEL = 'gemini-main'
process.env.GEMINI_FALLBACK_MODEL = 'gemini-backup'
process.env.GEMINI_RETRY_DELAYS_MS = '1,1'
process.env.OPENROUTER_MODEL = 'free/text:free'
process.env.OPENROUTER_VISION_MODEL = 'free/vision:free'
delete process.env.GROQ_REPORT_MODEL
delete process.env.GROQ_VISION_MODEL
delete process.env.DEMO_MODE

const express = (await import('express')).default
const reportRouter = (await import('../src/routes/report.js')).default
const { saveCached, hashFile } = await import('../src/report/cache.js')
const { stopOcr } = await import('../src/report/extractText.js')

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
const reply = JSON.stringify(analysis)

const realFetch = globalThis.fetch
// per provider: 'ok' | 'down' | '503' (Gemini) | 'badJsonOnce' (Groq: 400 json_validate_failed, then ok)
let state
let calls // { provider, url, body }
beforeEach(() => {
  state = { groq: 'ok', gemini: 'ok', openrouter: 'ok' }
  calls = []
})
const openAi = (content) => Response.json({ choices: [{ message: { content } }] })

globalThis.fetch = async (url, opts) => {
  url = String(url)
  if (url.startsWith('http://127.0.0.1')) return realFetch(url, opts)
  const provider = url.includes('groq') ? 'groq' : url.includes('generativelanguage') ? 'gemini' : 'openrouter'
  calls.push({ provider, url, body: JSON.parse(opts.body) })
  const mode = state[provider]
  if (mode === 'down') return new Response('quota', { status: 429 })
  if (mode === '503') return new Response('model is experiencing high demand', { status: 503 })
  if (mode === 'badJsonOnce') {
    state.groq = 'ok'
    return Response.json({ error: { message: 'Failed to generate JSON', code: 'json_validate_failed' } }, { status: 400 })
  }
  if (provider === 'gemini') return Response.json({ candidates: [{ content: { parts: [{ text: reply }] } }] })
  return openAi(reply)
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
after(async () => {
  server.close()
  await stopOcr()
})

const post = (file, headers = {}) =>
  realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ file }) })
const postStream = async (file) => {
  const res = await post(file, { Accept: 'application/x-ndjson' })
  return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}
// A distinct text PDF per test (distinct hash → no cache hits between tests)
const pdfFile = (label) => {
  const bytes = textPdf(['MRI RIGHT KNEE', `IMPRESSION: Early osteoarthritis. Case ${label}.`])
  return { file: { name: `${label}.pdf`, mimeType: 'application/pdf', data: bytes.toString('base64') }, hash: hashFile(bytes) }
}
const byProvider = (p) => calls.filter((c) => c.provider === p)

test('rejects unsupported files', async () => {
  const res = await post({ name: 'x.txt', mimeType: 'text/plain', data: 'aGk=' })
  assert.equal(res.status, 400)
})

test('text first: the PDF text (not the file) goes to Groq gpt-oss-120b in JSON mode; same file again is cached', async () => {
  const { file } = pdfFile('A')
  const body = await (await post(file)).json()
  assert.equal(body.provider, 'groq')
  assert.deepEqual(body.analysis.recommended_exercise_ids, ['mini-squat'])

  const [groq] = byProvider('groq')
  assert.equal(groq.body.model, 'openai/gpt-oss-120b')
  assert.deepEqual(groq.body.response_format, { type: 'json_object' })
  const user = groq.body.messages.at(-1).content
  assert.equal(typeof user, 'string', 'text only, no file parts')
  assert.match(user, /Early osteoarthritis\. Case A\./)

  calls = []
  const again = await (await post(file)).json()
  assert.equal(again.cached, true)
  assert.equal(calls.length, 0, 'no AI call for a known file')
})

test('no text found (blank image) → vision fallback with the file', { timeout: 120_000 }, async () => {
  const bytes = reportImage([])
  const body = await (await post({ name: 'blank.png', mimeType: 'image/png', data: bytes.toString('base64') })).json()
  assert.equal(body.provider, 'gemini')
  assert.equal(byProvider('groq').length, 0, 'Groq has no vision model here')
  const parts = byProvider('gemini')[0].body.contents[0].parts
  assert.equal(parts[0].inline_data.mime_type, 'image/png')
})

test('invalid JSON from Groq → asked once more, with the problem', async () => {
  state.groq = 'badJsonOnce'
  const body = await (await post(pdfFile('B').file)).json()
  assert.equal(body.provider, 'groq')
  const groq = byProvider('groq')
  assert.equal(groq.length, 2)
  assert.match(groq[1].body.messages.at(-1).content, /not valid/)
})

test('Groq down → Gemini text (503: 2 retries, fallback model) → OpenRouter free text model; progress streamed', async () => {
  state.groq = 'down'
  state.gemini = '503'
  const lines = await postStream(pdfFile('C').file)
  const gemini = byProvider('gemini')
  assert.equal(gemini.filter((c) => c.url.includes('gemini-main:')).length, 3)
  assert.equal(gemini.filter((c) => c.url.includes('gemini-backup:')).length, 3)
  assert.ok(gemini.every((c) => !c.body.contents[0].parts.some((p) => p.inline_data)), 'Gemini got text, not the file')
  const [or] = byProvider('openrouter')
  assert.equal(or.body.model, 'free/text:free')
  assert.ok(lines.some((l) => l.type === 'retrying'))
  assert.equal(lines.at(-1).type, 'result')
  assert.equal(lines.at(-1).provider, 'openrouter')
})

test('a cached answer from an older prompt is redone, but served if every provider fails', async () => {
  const stale = pdfFile('D')
  await saveCached(stale.hash, { analysis: { ...analysis, diagnosis: 'old' }, provider: 'gemini', promptVersion: 'old' })
  let body = await (await post(stale.file)).json()
  assert.notEqual(body.analysis.diagnosis, 'old')

  const stale2 = pdfFile('E')
  await saveCached(stale2.hash, { analysis: { ...analysis, diagnosis: 'old' }, provider: 'gemini', promptVersion: 'old' })
  state = { groq: 'down', gemini: 'down', openrouter: 'down' }
  body = await (await post(stale2.file)).json()
  assert.equal(body.cached, true)
  assert.equal(body.analysis.diagnosis, 'old')
  assert.ok(body.message)
})

test('DEMO_MODE serves any cached answer for a known file without calling the AI', async () => {
  const stale = pdfFile('F')
  await saveCached(stale.hash, { analysis: { ...analysis, diagnosis: 'demo' }, provider: 'openrouter', promptVersion: 'old' })
  process.env.DEMO_MODE = 'true'
  try {
    const body = await (await post(stale.file)).json()
    assert.equal(body.analysis.diagnosis, 'demo')
    assert.equal(calls.length, 0)
  } finally {
    delete process.env.DEMO_MODE
  }
})

test('unknown file with every provider down → ai_unavailable (503, or a streamed error line)', async () => {
  state = { groq: 'down', gemini: 'down', openrouter: 'down' }
  assert.equal((await post(pdfFile('G').file)).status, 503)
  const lines = await postStream(pdfFile('H').file)
  assert.deepEqual(lines.at(-1), { type: 'error', error: 'ai_unavailable' })
})
