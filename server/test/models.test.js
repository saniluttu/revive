import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickGeminiModels, pickGroqModels, pickOpenRouterModels } from '../src/llm/models.js'

const or = (id, { input = ['text'], output = ['text'], prompt = '0', completion = '0', rf = true, extra = {}, expires } = {}) => ({
  id,
  architecture: { input_modalities: input, output_modalities: output },
  pricing: { prompt, completion, ...extra },
  supported_parameters: rf ? ['response_format'] : [],
  expiration_date: expires ?? null,
})

test('OpenRouter: only free, text-output, non-specialist models; vision needs image input', () => {
  const now = Date.parse('2026-10-16')
  const picks = pickOpenRouterModels(
    [
      or('paid/big-400b', { input: ['text', 'image'], prompt: '0.000001' }),
      or('google/gemma-4-31b-it:free', { input: ['image', 'text'] }),
      or('google/gemma-4-26b-a4b-it:free', { input: ['image', 'text'] }),
      or('nvidia/nemotron-3-super-120b-a12b:free'),
      or('nvidia/nemotron-3-ultra-550b-a55b:free', { rf: false }),
      or('nvidia/nemotron-3.5-content-safety:free', { input: ['text', 'image'] }),
      or('cohere/north-mini-code:free'),
      or('google/lyria-3-pro-preview', { input: ['text', 'image'], output: ['text', 'audio'] }),
      or('openrouter/free', { input: ['text', 'image'] }),
      or('variable/model', { prompt: '-1', completion: '-1' }),
      or('per-request/fee:free', { extra: { request: '0.01' } }),
      or('expiring/vl-90b:free', { input: ['text', 'image'], expires: '2026-10-20' }),
    ],
    now,
  )
  assert.deepEqual(picks.vision, ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'])
  assert.deepEqual(picks.text, [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
  ])
})

test('Groq: vision model only when one exists; audio/guard models never chosen', () => {
  const withVision = pickGroqModels([
    { id: 'whisper-large-v3' },
    { id: 'llama-3.3-70b-versatile' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    { id: 'meta-llama/llama-guard-4-12b' },
    { id: 'old-vision-11b', active: false },
  ])
  assert.deepEqual(withVision.vision, ['meta-llama/llama-4-scout-17b-16e-instruct'])
  assert.equal(withVision.text[0], 'llama-3.3-70b-versatile')
  assert.deepEqual(pickGroqModels([{ id: 'llama-3.3-70b-versatile' }]).vision, [])
})

test('Gemini: newest stable flash first', () => {
  const m = (name) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] })
  assert.deepEqual(
    pickGeminiModels([
      m('gemini-2.5-flash'),
      m('gemini-3.8-flash-preview-09'),
      m('gemini-3.8-flash'),
      m('gemini-3.8-flash-lite'),
      m('gemini-3.8-pro'),
      { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
    ]),
    ['gemini-3.8-flash', 'gemini-3.8-flash-preview-09', 'gemini-2.5-flash'],
  )
})
