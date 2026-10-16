// End-to-end: POST /api/report/analyze with provider HTTP calls stubbed.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

process.env.REPORT_CACHE_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'revive-')), 'cache.json')
process.env.GEMINI_API_KEYS = 'g1'
process.env.OPENROUTER_API_KEYS = 'o1'
process.env.GROQ_API_KEYS = 'q1'

const express = (await import('express')).default
const reportRouter = (await import('../src/routes/report.js')).default

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
let mode = 'ok' // ok | geminiDown | allDown
const calls = []

globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, opts)
  calls.push(String(url))
  const fail = () => new Response('quota', { status: 429 })
  if (String(url).includes('generativelanguage')) {
    if (mode !== 'ok') return fail()
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] })
  }
  if (String(url).includes('openrouter')) {
    if (mode === 'allDown') return fail()
    return Response.json({ choices: [{ message: { content: JSON.stringify(analysis) } }] })
  }
  return fail()
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

const post = (file) =>
  realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) })
const fileA = { name: 'a.png', mimeType: 'image/png', data: Buffer.from('report A').toString('base64') }
const fileB = { name: 'b.png', mimeType: 'image/png', data: Buffer.from('report B').toString('base64') }

test('rejects unsupported files', async () => {
  const res = await post({ name: 'x.txt', mimeType: 'text/plain', data: 'aGk=' })
  assert.equal(res.status, 400)
})

test('Gemini answers; invalid exercise ids are dropped', async () => {
  const res = await post(fileA)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.provider, 'gemini')
  assert.deepEqual(body.analysis.recommended_exercise_ids, ['mini-squat'])
  assert.ok(!calls.some((u) => u.includes('groq')), 'Groq has no vision and must be skipped')
})

test('falls back to OpenRouter, then to the cache for the same file', async () => {
  mode = 'geminiDown'
  let body = await (await post(fileA)).json()
  assert.equal(body.provider, 'openrouter')

  // gemini & openrouter keys are now cooling down for 60 s → everything fails
  mode = 'allDown'
  const res = await post(fileA)
  body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.cached, true)
  assert.equal(body.provider, 'openrouter')
  assert.equal(body.analysis.diagnosis, analysis.diagnosis)

  const miss = await post(fileB)
  assert.equal(miss.status, 503)
})
