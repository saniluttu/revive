// Local Ollama provider: startup check, first in line for text tasks, never for vision.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

process.env.GROQ_API_KEYS = 'q1'
delete process.env.GEMINI_API_KEYS
delete process.env.OPENROUTER_API_KEYS
delete process.env.OLLAMA_MODEL
delete process.env.OLLAMA_URL
delete process.env.OLLAMA_TIMEOUT_MS
delete process.env.GROQ_VISION_MODEL

const { initModels, chosenModels } = await import('../src/llm/models.js')
const { route } = await import('../src/llm/llmRouter.js')

const realFetch = globalThis.fetch
const realLog = console.log
const realWarn = console.warn
afterEach(() => {
  globalThis.fetch = realFetch
  console.log = realLog
  console.warn = realWarn
})

const groqModels = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'openai/gpt-oss-120b' }] }
const groqReply = Response.json({ choices: [{ message: { content: '{"from":"groq"}' } }] })

// tags: models list from Ollama, or 'down' (connection refused)
async function startWith(tags) {
  const logs = []
  console.log = console.warn = (...a) => logs.push(a.join(' '))
  globalThis.fetch = async (url) => {
    url = String(url)
    if (url === 'http://localhost:11434/api/tags') {
      if (tags === 'down') throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
      return Response.json({ models: tags })
    }
    if (url.includes('groq.com')) return Response.json(groqModels)
    if (url.includes('openrouter.ai')) return Response.json({ data: [] })
    throw new Error(`unexpected ${url}`)
  }
  await initModels()
  return logs
}

// Records calls; Ollama answers with `ollama` ('ok' | 'down'), Groq always ok
function stubCalls(ollama = 'ok') {
  const calls = []
  globalThis.fetch = async (url, opts) => {
    url = String(url)
    const body = JSON.parse(opts.body)
    calls.push({ url, body, provider: url.includes('11434') ? 'ollama' : 'groq' })
    if (url.includes('11434')) {
      if (ollama === 'down') throw new TypeError('fetch failed')
      return Response.json({ message: { role: 'assistant', content: '{"from":"ollama"}' } })
    }
    return groqReply.clone()
  }
  return calls
}

test('Ollama running with qwen2.5:3b → first for report text, format json, 90 s timeout', async () => {
  await startWith([{ name: 'qwen2.5:3b', model: 'qwen2.5:3b' }])
  assert.equal(chosenModels().ollama.text, 'qwen2.5:3b')

  const realTimeout = AbortSignal.timeout
  const timeouts = []
  AbortSignal.timeout = (ms) => (timeouts.push(ms), realTimeout.call(AbortSignal, ms))
  const calls = stubCalls()
  try {
    const res = await route({ task: 'report', system: 'sys', json: true, messages: [{ role: 'user', content: 'report text' }] })
    assert.equal(res.provider, 'ollama')
    assert.equal(res.model, 'qwen2.5:3b')
    assert.equal(typeof res.ms, 'number')
  } finally {
    AbortSignal.timeout = realTimeout
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://localhost:11434/api/chat')
  assert.equal(calls[0].body.model, 'qwen2.5:3b')
  assert.equal(calls[0].body.format, 'json')
  assert.equal(calls[0].body.stream, false)
  assert.deepEqual(calls[0].body.messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'report text' },
  ])
  assert.deepEqual(timeouts, [90_000])
})

test('chat goes to Ollama first too, without JSON format', async () => {
  const calls = stubCalls()
  const res = await route({ task: 'chat', messages: [{ role: 'user', content: 'hello' }] })
  assert.equal(res.provider, 'ollama')
  assert.equal(calls[0].body.format, undefined)
})

test('vision never goes to Ollama', async () => {
  const calls = stubCalls()
  await route({
    task: 'vision',
    messages: [{ role: 'user', content: 'read' }],
    images: [{ mimeType: 'image/png', data: 'iVBORw0=' }],
  })
  assert.ok(!calls.some((c) => c.provider === 'ollama'))
})

test('Ollama failing mid-run → Groq answers the report', async () => {
  const calls = stubCalls('down')
  console.warn = () => {}
  const res = await route({ task: 'report', json: true, messages: [{ role: 'user', content: 'report text' }] })
  assert.equal(res.provider, 'groq')
  assert.deepEqual(calls.map((c) => c.provider), ['ollama', 'groq'])
})

test('Ollama not running at startup → logged and skipped', async () => {
  const logs = await startWith('down')
  assert.ok(logs.some((l) => /Ollama is not running at http:\/\/localhost:11434/.test(l)), logs.join('\n'))
  assert.equal(chosenModels().ollama.text, null)
  const calls = stubCalls()
  const res = await route({ task: 'report', json: true, messages: [{ role: 'user', content: 'report text' }] })
  assert.equal(res.provider, 'groq')
  assert.ok(!calls.some((c) => c.provider === 'ollama'))
})

test('Ollama running but the model is not pulled → logged and skipped', async () => {
  const logs = await startWith([{ name: 'llama3.2:1b', model: 'llama3.2:1b' }])
  assert.ok(logs.some((l) => l.includes('ollama pull qwen2.5:3b')), logs.join('\n'))
  assert.equal(chosenModels().ollama.text, null)
})
