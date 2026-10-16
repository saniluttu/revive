// Provider adapters. Each exposes call({ key, system, messages, images, json, task })
// and returns the response text. Errors carry `status` (HTTP code) when known.

const TIMEOUT_MS = 15_000

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
          ...images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
        ],
      })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  })
  return out
}

export const gemini = {
  name: 'gemini',
  envKey: 'GEMINI_API_KEYS',
  supportsVision: true,
  async call({ key, system, messages, images, json }) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const contents = messages.map((m, i) => {
      const parts = [{ text: m.content }]
      if (i === messages.length - 1 && images?.length) {
        images.forEach((img) => parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } }))
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    })
    const body = { contents }
    if (system) body.systemInstruction = { parts: [{ text: system }] }
    if (json) body.generationConfig = { responseMimeType: 'application/json' }
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { 'x-goog-api-key': key },
      body,
    )
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new Error('Gemini returned an empty response')
    return text
  },
}

export const groq = {
  name: 'groq',
  envKey: 'GROQ_API_KEYS',
  supportsVision: false,
  async call({ key, json, ...req }) {
    const body = {
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: toOpenAIMessages(req),
    }
    if (json) body.response_format = { type: 'json_object' }
    const data = await postJson('https://api.groq.com/openai/v1/chat/completions', { Authorization: `Bearer ${key}` }, body)
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('Groq returned an empty response')
    return text
  },
}

export const openrouter = {
  name: 'openrouter',
  envKey: 'OPENROUTER_API_KEYS',
  supportsVision: true,
  async call({ key, json, task, ...req }) {
    const model =
      task === 'vision'
        ? process.env.OPENROUTER_VISION_MODEL || 'google/gemma-3-27b-it:free'
        : process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
    const body = { model, messages: toOpenAIMessages(req) }
    if (json) body.response_format = { type: 'json_object' }
    const data = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      { Authorization: `Bearer ${key}`, 'X-Title': 'Revive' },
      body,
    )
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenRouter returned an empty response')
    return text
  },
}

export const PROVIDERS = { gemini, groq, openrouter }
