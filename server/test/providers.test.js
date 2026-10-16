// Request shapes sent to each provider, and the 404 "change this env var" message.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

process.env.GEMINI_API_KEYS = 'g1'
process.env.GROQ_API_KEYS = 'q1'
process.env.OPENROUTER_API_KEYS = 'o1'
process.env.GEMINI_MODEL = 'gemini-3.8-flash'
process.env.GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
process.env.OPENROUTER_VISION_MODEL = 'google/gemma-4-31b-it:free'

const { route } = await import('../src/llm/llmRouter.js')

const realFetch = globalThis.fetch
const realError = console.error
afterEach(() => {
  globalThis.fetch = realFetch
  console.error = realError
})

const pdf = { name: 'r.pdf', mimeType: 'application/pdf', data: 'JVBERi0=' }
const png = { name: 'r.png', mimeType: 'image/png', data: 'iVBORw0=' }
const ok = { candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }

test('Gemini gets the PDF as inline_data application/pdf, before the prompt', async () => {
  let sent
  globalThis.fetch = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body) }
    return Response.json(ok)
  }
  const res = await route({ task: 'vision', messages: [{ role: 'user', content: 'read' }], images: [pdf] })
  assert.equal(res.provider, 'gemini')
  assert.match(sent.url, /models\/gemini-3\.8-flash:generateContent$/)
  assert.deepEqual(sent.body.contents[0].parts, [
    { inline_data: { mime_type: 'application/pdf', data: 'JVBERi0=' } },
    { text: 'read' },
  ])
})

test('Gemini 404 logs which env var to change; PDFs skip Groq and go to OpenRouter with the free parser', async () => {
  const logged = []
  console.error = (...a) => logged.push(a.join(' '))
  const urls = []
  let orBody
  globalThis.fetch = async (url, opts) => {
    urls.push(String(url))
    if (String(url).includes('generativelanguage')) return new Response('models/gemini-3.8-flash is no longer available', { status: 404 })
    orBody = JSON.parse(opts.body)
    return Response.json({ choices: [{ message: { content: '{"ok":1}' } }] })
  }
  const res = await route({ task: 'vision', messages: [{ role: 'user', content: 'read' }], images: [pdf] })
  assert.equal(res.provider, 'openrouter')
  assert.ok(!urls.some((u) => u.includes('groq')), 'Groq cannot read PDFs')
  assert.ok(logged.some((l) => l.includes('GEMINI_MODEL') && l.includes('gemini-3.8-flash')), logged.join('\n'))
  assert.equal(orBody.model, 'google/gemma-4-31b-it:free')
  assert.deepEqual(orBody.plugins, [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }])
  assert.equal(orBody.messages[0].content[1].type, 'file')
})

test('images fall back to Groq vision as image_url', async () => {
  let groqBody
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('generativelanguage')) return new Response('quota', { status: 429 })
    groqBody = JSON.parse(opts.body)
    return Response.json({ choices: [{ message: { content: '{"ok":1}' } }] })
  }
  const res = await route({ task: 'vision', messages: [{ role: 'user', content: 'read' }], images: [png] })
  assert.equal(res.provider, 'groq')
  assert.equal(groqBody.model, 'meta-llama/llama-4-scout-17b-16e-instruct')
  assert.deepEqual(groqBody.messages[0].content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0=' } })
})
