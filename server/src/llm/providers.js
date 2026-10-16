// Provider adapters. Each exposes call({ key, system, messages, images, json, task, timeoutMs })
// and returns the response text, plus supports(req) saying whether it can take
// the request right now. Errors carry `status` (HTTP code) when known, and
// `model` / `modelEnv` so a 404 can say which env var to change.

import { modelEnvVar, modelFor } from './models.js'


const isPdf = (img) => img.mimeType === 'application/pdf'
const hasPdf = (req) => Boolean(req.images?.some(isPdf))

async function postJson(url, headers, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// OpenAI-compatible message list (Groq, OpenRouter)
function toOpenAIMessages({ system, messages, images }) {
  const out = []
  if (system) out.push({ role: 'system', content: system })
  messages.forEach((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === 'user'
    if (isLastUser && images?.length) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...images.map((img) => {
            const url = `data:${img.mimeType};base64,${img.data}`
            // PDFs go as a file part (OpenRouter parses them); images as image_url
            return isPdf(img)
              ? { type: 'file', file: { filename: img.name || 'report.pdf', file_data: url } }
              : { type: 'image_url', image_url: { url } }
          }),
        ],
      })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  })
  return out
}

// Tag errors with the model, so the router can name the env var to fix on a 404
async function withModel(provider, task, model, fn) {
  try {
    return await fn()
  } catch (err) {
    err.model = Array.isArray(model) ? model.join(', ') : model
    err.modelEnv = modelEnvVar(provider, task)
    throw err
  }
}

export const gemini = {
  name: 'gemini',
  envKey: 'GEMINI_API_KEYS',
  supports: ({ task }) => Boolean(modelFor('gemini', task)),
  async call({ key, system, messages, images, json, task, timeoutMs }) {
    const model = modelFor('gemini', task)
    const contents = messages.map((m, i) => {
      const parts = []
      // Files first, then the instruction (Gemini's recommended order).
      // PDFs and images both go inline: { mime_type: 'application/pdf' | 'image/jpeg' | 'image/png' }
      if (i === messages.length - 1 && images?.length) {
        images.forEach((img) => parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } }))
      }
      parts.push({ text: m.content })
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    })
    const body = { contents }
    if (system) body.systemInstruction = { parts: [{ text: system }] }
    if (json) body.generationConfig = { responseMimeType: 'application/json' }
    const data = await withModel('gemini', task, model, () =>
      postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { 'x-goog-api-key': key },
        body,
        timeoutMs,
      ),
    )
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new Error('Gemini returned an empty response')
    return text
  },
}

export const groq = {
  name: 'groq',
  envKey: 'GROQ_API_KEYS',
  // Groq vision models take images only, not PDFs
  supports: (req) => Boolean(modelFor('groq', req.task)) && !hasPdf(req),
  async call({ key, json, task, timeoutMs, ...req }) {
    const model = modelFor('groq', task)
    const body = { model, messages: toOpenAIMessages(req) }
    if (json) body.response_format = { type: 'json_object' }
    const data = await withModel('groq', task, model, () =>
      postJson('https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${key}` }, body, timeoutMs),
    )
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('Groq returned an empty response')
    return text
  },
}

export const openrouter = {
  name: 'openrouter',
  envKey: 'OPENROUTER_API_KEYS',
  // Only free models are ever chosen (see models.js); none chosen → skip OpenRouter
  supports: ({ task }) => Boolean(modelFor('openrouter', task)),
  async call({ key, json, task, timeoutMs, ...req }) {
    const models = [modelFor('openrouter', task)].flat()
    const body = { model: models[0], messages: toOpenAIMessages(req) }
    if (models.length > 1) body.models = models // OpenRouter falls back through these in order
    if (json) body.response_format = { type: 'json_object' }
    // Free text extraction for PDFs (the default engine may be a paid OCR)
    if (hasPdf(req)) body.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]
    const data = await withModel('openrouter', task, models, () =>
      postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        { Authorization: `Bearer ${key}`, 'X-Title': 'Revive' },
        body,
        timeoutMs,
      ),
    )
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenRouter returned an empty response')
    return text
  },
}

export const PROVIDERS = { gemini, groq, openrouter }
