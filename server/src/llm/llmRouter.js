// Multi-provider LLM router with fallback (REQUIREMENTS §5).
// Tries providers in task order, skipping keys that are cooling down after a
// 429 / quota / timeout / 5xx. If everything fails, returns a cached/demo response.

import { PROVIDERS } from './providers.js'

const COOLDOWN_MS = 60_000

// Provider order per task type
const TASK_ORDER = {
  vision: ['gemini', 'openrouter'],
  chat: ['groq', 'gemini', 'openrouter'],
  text: ['gemini', 'groq', 'openrouter'],
}

const keyState = new Map() // `${provider}:${index}` -> cooldownUntil (ms)
const rrIndex = new Map() // provider -> next key index (round-robin)

function keysFor(provider) {
  return (process.env[provider.envKey] || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

function isCoolingDown(id) {
  return (keyState.get(id) || 0) > Date.now()
}

function shouldCoolDown(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
  if (!err.status) return true // network failure
  return err.status === 429 || err.status === 403 || err.status >= 500
}

// Yields available keys for a provider, starting at its round-robin position
function* availableKeys(provider) {
  const keys = keysFor(provider)
  if (!keys.length) return
  const start = rrIndex.get(provider.name) || 0
  rrIndex.set(provider.name, (start + 1) % keys.length)
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length
    const id = `${provider.name}:${idx}`
    if (!isCoolingDown(id)) yield { id, key: keys[idx] }
  }
}

/**
 * @param {object} req
 * @param {'chat'|'vision'|'text'} [req.task='text']
 * @param {string} [req.system] system prompt
 * @param {{role:'user'|'assistant', content:string}[]} req.messages
 * @param {{mimeType:string, data:string}[]} [req.images] base64 images (vision)
 * @param {boolean} [req.json] ask for a JSON response
 * @param {() => string} [req.fallback] cached/demo response if all providers fail
 * @returns {Promise<{text:string, provider:string, fallback?:boolean, message?:string}>}
 */
export async function route(req) {
  const task = req.task || 'text'
  const order = TASK_ORDER[task] || TASK_ORDER.text
  const errors = []

  for (const name of order) {
    const provider = PROVIDERS[name]
    if (req.images?.length && !provider.supportsVision) continue

    for (const { id, key } of availableKeys(provider)) {
      const started = Date.now()
      try {
        const text = await provider.call({ ...req, task, key })
        console.log(`[llmRouter] ${task} answered by ${name} (${Date.now() - started} ms)`)
        return { text, provider: name }
      } catch (err) {
        errors.push(`${id}: ${err.message}`)
        console.warn(`[llmRouter] ${id} failed: ${err.message}`)
        if (shouldCoolDown(err)) keyState.set(id, Date.now() + COOLDOWN_MS)
      }
    }
  }

  console.error(`[llmRouter] all providers failed for ${task}`, errors)
  return {
    text: req.fallback ? req.fallback() : '',
    provider: 'cache',
    fallback: true,
    message: 'Our AI helpers are busy right now — showing a saved response.',
  }
}

// Summary for /api/health
export function status() {
  return Object.values(PROVIDERS).map((p) => {
    const keys = keysFor(p)
    const cooling = keys.filter((_, i) => isCoolingDown(`${p.name}:${i}`)).length
    return { provider: p.name, keys: keys.length, coolingDown: cooling }
  })
}

export default { route, status }
