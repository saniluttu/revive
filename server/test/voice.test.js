// /api/tts, /api/stt, /api/chat with Sarvam, Groq and the LLM providers stubbed.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'

process.env.SARVAM_API_KEY = 's1'
process.env.GROQ_API_KEYS = 'q1'
process.env.GROQ_MODEL = 'llama-test'
delete process.env.GEMINI_API_KEYS
delete process.env.OPENROUTER_API_KEYS
delete process.env.SARVAM_TTS_SPEAKER

const express = (await import('express')).default
const voiceRouter = (await import('../src/routes/voice.js')).default
const chatRouter = (await import('../src/routes/chat.js')).default
const { hasRedFlag } = await import('../src/voice/redFlags.js')

const realFetch = globalThis.fetch
let state // { sarvam: 'ok'|'down', whisper: 'ok'|'down', llm: string reply | 'down' }
let calls
beforeEach(() => {
  state = { sarvam: 'ok', whisper: 'ok', llm: JSON.stringify({ reply: 'Lift slowly to shoulder height.', redFlag: false }) }
  calls = []
})

globalThis.fetch = async (url, opts = {}) => {
  url = String(url)
  if (url.startsWith('http://127.0.0.1')) return realFetch(url, opts)
  calls.push({ url, opts })
  if (url.includes('api.sarvam.ai')) {
    if (state.sarvam === 'down') return new Response('overloaded', { status: 503 })
    if (url.endsWith('/text-to-speech')) return Response.json({ audios: [Buffer.from('MP3DATA').toString('base64')] })
    return Response.json({ transcript: ' കൈ എത്ര ഉയർത്തണം? ', language_code: 'ml-IN' })
  }
  if (url.includes('/audio/transcriptions')) {
    if (state.whisper === 'down') return new Response('nope', { status: 500 })
    return Response.json({ text: 'from whisper' })
  }
  if (url.includes('api.groq.com')) {
    if (state.llm === 'down') return new Response('quota', { status: 429 })
    return Response.json({ choices: [{ message: { content: state.llm } }] })
  }
  return new Response('unexpected', { status: 500 })
}

let server
let base
before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', voiceRouter)
  app.use('/api/chat', chatRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  server.close()
  globalThis.fetch = realFetch
})

const postJson = (path, body) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const postAudio = (query) =>
  fetch(`${base}/api/stt?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm;codecs=opus' },
    body: Buffer.from('fake webm'),
  })

describe('POST /api/tts', () => {
  test('returns Sarvam audio in the requested language', async () => {
    const res = await postJson('/api/tts', { text: 'നന്നായി ചെയ്തു!', lang: 'ml-IN' })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'audio/mpeg')
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'MP3DATA')
    const sent = JSON.parse(calls[0].opts.body)
    assert.equal(sent.language_code, 'ml-IN')
    assert.equal(sent.model, 'bulbul:v3')
    assert.equal(calls[0].opts.headers['api-subscription-key'], 's1')
  })

  test('503 when Sarvam fails (the client then uses speechSynthesis)', async () => {
    state.sarvam = 'down'
    const res = await postJson('/api/tts', { text: 'Well done!', lang: 'en-IN' })
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { error: 'tts_unavailable' })
  })

  test('400 on empty text', async () => {
    assert.equal((await postJson('/api/tts', { text: ' ' })).status, 400)
  })
})

describe('POST /api/stt', () => {
  test('transcribes with Sarvam', async () => {
    const res = await postAudio('lang=ml-IN&provider=sarvam')
    assert.deepEqual(await res.json(), { text: 'കൈ എത്ര ഉയർത്തണം?', lang: 'ml-IN', provider: 'sarvam' })
    const form = calls[0].opts.body
    assert.equal(form.get('language_code'), 'ml-IN')
    assert.equal(form.get('model'), 'saaras:v4')
    assert.equal(form.get('file').name, 'question.webm')
  })

  test('503 when only Sarvam is asked for and it fails', async () => {
    state.sarvam = 'down'
    assert.equal((await postAudio('lang=ml-IN&provider=sarvam')).status, 503)
  })

  test('Groq Whisper on request, with the ISO language code', async () => {
    const res = await postAudio('lang=en-IN&provider=groq')
    assert.deepEqual(await res.json(), { text: 'from whisper', lang: 'en-IN', provider: 'groq' })
    assert.equal(calls[0].opts.body.get('language'), 'en')
  })

  test('without a provider, falls back from Sarvam to Groq Whisper', async () => {
    state.sarvam = 'down'
    const res = await postAudio('lang=ml-IN')
    assert.equal((await res.json()).provider, 'groq')
  })

  test('400 on an empty body or unknown provider', async () => {
    const empty = await fetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: '' })
    assert.equal(empty.status, 400)
    assert.equal((await postAudio('provider=nope')).status, 400)
  })
})

describe('POST /api/chat', () => {
  test('answers with the patient context in the system prompt', async () => {
    const res = await postJson('/api/chat', {
      question: 'How high should I lift my arm?',
      lang: 'ml',
      exerciseId: 'shoulder-abduction',
      plan: [{ exerciseId: 'shoulder-abduction', reps: 8, sets: 2 }],
    })
    assert.deepEqual(await res.json(), { reply: 'Lift slowly to shoulder height.', redFlag: false, provider: 'groq' })
    const { messages } = JSON.parse(calls[0].opts.body)
    const system = messages[0].content
    assert.match(system, /doing this exercise right now: shoulder-abduction/)
    assert.match(system, /8 reps × 2 sets/)
    assert.match(system, /Malayalam/)
    assert.equal(messages.at(-1).content, 'How high should I lift my arm?')
  })

  test('red-flag symptoms are answered without asking the AI', async () => {
    const res = await postJson('/api/chat', { question: 'എനിക്ക് നെഞ്ചുവേദന ഉണ്ട്', lang: 'ml' })
    assert.deepEqual(await res.json(), { reply: null, redFlag: true })
    assert.equal(calls.length, 0)
  })

  test('a red flag the model notices is passed on', async () => {
    state.llm = JSON.stringify({ reply: 'Please stop.', redFlag: true })
    const res = await postJson('/api/chat', { question: 'my knee feels hot and odd', lang: 'en' })
    assert.deepEqual(await res.json(), { reply: null, redFlag: true })
  })

  test('503 when every AI provider fails', async () => {
    state.llm = 'down'
    const res = await postJson('/api/chat', { question: 'How many reps?', lang: 'en' })
    assert.equal(res.status, 503)
  })

  test('400 on an empty question', async () => {
    assert.equal((await postJson('/api/chat', { question: '' })).status, 400)
  })
})

describe('hasRedFlag', () => {
  test('catches red-flag symptoms in English and Malayalam', () => {
    for (const q of [
      'I have chest pain',
      'severe pain in my knee',
      'my fingers feel numb',
      'tingling in my arm',
      'my knee is swollen',
      'I fell yesterday',
      'I feel dizzy',
      'കാലിൽ മരവിപ്പ്',
      'മുട്ടിൽ നീര് വന്നു',
      'ഞാൻ ഇന്നലെ വീണു',
      'തലകറക്കം ഉണ്ട്',
      'കടുത്ത വേദന',
    ]) {
      assert.ok(hasRedFlag(q), q)
    }
  })

  test('leaves ordinary exercise questions alone', () => {
    for (const q of [
      'How many reps should I do?',
      'What number of sets is right?',
      'Can I do this exercise again tomorrow?',
      'കൈ എത്ര ഉയർത്തണം?',
      'വീണ്ടും ചെയ്യാമോ?',
      'my shoulder is a little sore after exercise',
    ]) {
      assert.ok(!hasRedFlag(q), q)
    }
  })
})
