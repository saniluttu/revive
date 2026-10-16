// Multi-provider LLM router with fallback (REQUIREMENTS §5).
// For each provider in task order → each of its models (Gemini has a fallback
// model) → each key not cooling down after a 429 / quota / timeout / 5xx →
// the request, retried with backoff on the statuses the provider lists
// (Gemini: 503 "high demand" and 429, after 2 s and 5 s).
// If everything fails, returns a cached/demo response.

import { chosenModels, modelEnvVar, modelsFor } from './models.js'
import { PROVIDERS } from './providers.js'

const COOLDOWN_MS = 60_000

// Per-call timeout by task: vision (free OpenRouter vision models are slow) 60 s,
// report text → JSON 30 s, chat 15 s
const TIMEOUT_MS = {
  vision: Number(process.env.LLM_VISION_TIMEOUT_MS) || 60_000,
  report: Number(process.env.LLM_REPORT_TIMEOUT_MS) || 30_000,
  default: Number(process.env.LLM_TIMEOUT_MS) || 15_000,
}

// Provider order per task type. Ollama (local) goes first for text tasks when it's running.
const TASK_ORDER = {
  report: ['ollama', 'groq', 'gemini', 'openrouter'], // report text → JSON
  vision: ['gemini', 'groq', 'openrouter'], // Groq only if it has a vision model and no PDF is attached
  chat: ['ollama', 'groq', 'gemini', 'openrouter'],
  text: ['gemini', 'groq', 'openrouter'],
}

const keyState = new Map() // `${provider}:${model}:${index}` -> cooldownUntil (ms)
const rrIndex = new Map() // provider -> next key index (round-robin)

function keysFor(provider) {
  return (process.env[provider.envKey] || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const modelName = (model) => [model].flat().join(', ')

function isCoolingDown(id) {
  return (keyState.get(id) || 0) > Date.now()
}

// Groq in JSON mode rejects output that isn't valid JSON with a 400 — same as an invalid reply
function isInvalidJsonError(err) {
  return err.status === 400 && /json_validate_failed|failed to generate json/i.test(err.message)
}

// The model itself is wrong (gone, renamed, no longer free) — every key will fail the same way
function isModelError(err) {
  return err.status === 404 || err.status === 402
}

function shouldCoolDown(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
  if (!err.status) return true // network failure
  return err.status === 429 || err.status === 403 || err.status >= 500
}

// Yields available keys for a provider + model, starting at its round-robin position.
// Cooldowns are per model: an overloaded or rate-limited model says nothing about the fallback.
// Keyless providers (Ollama) get one pseudo key.
function* availableKeys(provider, model) {
  if (provider.keyless) {
    const id = `${provider.name}:${modelName(model)}:0`
    if (!isCoolingDown(id)) yield { id, key: null }
    return
  }
  const keys = keysFor(provider)
  if (!keys.length) return
  const start = rrIndex.get(provider.name) || 0
  rrIndex.set(provider.name, (start + 1) % keys.length)
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length
    const id = `${provider.name}:${modelName(model)}:${idx}`
    if (!isCoolingDown(id)) yield { id, key: keys[idx] }
  }
}

/**
 * @param {object} req
 * @param {'chat'|'vision'|'text'|'report'} [req.task='text']
 * @param {string} [req.system] system prompt
 * @param {{role:'user'|'assistant', content:string}[]} req.messages
 * @param {{mimeType:string, data:string}[]} [req.images] base64 images (vision)
 * @param {boolean} [req.json] ask for a JSON response
 * @param {number} [req.timeoutMs] per-call timeout (default by task, see TIMEOUT_MS; Ollama 90 s)
 * @param {(text:string) => any} [req.parse] validates/parses the reply; if it throws,
 *   the same model is asked again (up to `parseRetries` times, with the error), then the
 *   next model / provider is tried (no cooldown — the provider itself is healthy)
 * @param {number} [req.parseRetries=0]
 * @param {(event:{type:'retrying', provider:string, model:string}) => void} [req.onEvent]
 *   progress: called before every attempt after the first (retry, fallback model or provider)
 * @param {() => string} [req.fallback] cached/demo response if all providers fail
 * @returns {Promise<{text:string, data?:any, provider:string, model?:string, ms?:number, fallback?:boolean, message?:string}>}
 *   `ms` is how long the successful call took
 */
export async function route(req) {
  const task = req.task || 'text'
  const order = TASK_ORDER[task] || TASK_ORDER.text
  const timeoutMs = req.timeoutMs ?? TIMEOUT_MS[task] ?? TIMEOUT_MS.default
  const errors = []
  let attempts = 0

  for (const name of order) {
    const provider = PROVIDERS[name]
    if (!provider.supports({ ...req, task })) continue
    const delays = provider.retry?.delaysMs ?? []
    const callTimeoutMs = req.timeoutMs ?? provider.timeoutMs ?? timeoutMs

    modelLoop: for (const [modelIndex, model] of modelsFor(name, task).entries()) {
      for (const { id, key } of availableKeys(provider, model)) {
        let messages = req.messages
        let parseRetries = req.parseRetries ?? 0
        // Ask the same model again, telling it what was wrong with its reply
        const askAgain = (reply, problem) => {
          parseRetries--
          messages = [
            ...messages,
            ...(reply ? [{ role: 'assistant', content: reply }] : []),
            { role: 'user', content: `Your reply was not valid (${problem}). Reply again with ONLY the JSON object described in the instructions.` },
          ]
        }
        let backoff = 0
        for (;;) {
          if (attempts++ > 0) req.onEvent?.({ type: 'retrying', provider: name, model: modelName(model) })
          const started = Date.now()
          let text
          try {
            text = await provider.call({ ...req, messages, task, key, model, timeoutMs: callTimeoutMs })
          } catch (err) {
            errors.push(`${id}: ${err.message}`)
            if (isInvalidJsonError(err)) {
              console.warn(`[llmRouter] ${id} produced invalid JSON${parseRetries > 0 ? ' — asking again' : ''}`)
              if (parseRetries > 0) {
                askAgain(null, 'not valid JSON')
                continue
              }
              continue modelLoop
            }
            if (isModelError(err)) {
              const envVar = modelEnvVar(name, task, modelIndex)
              console.error(
                `[llmRouter] ${name} model "${modelName(model)}" is not available (HTTP ${err.status}). ` +
                  `Change ${envVar} in server/.env to a current model, then restart the server. ${err.message}`,
              )
              continue modelLoop
            }
            if (provider.retry?.statuses.includes(err.status) && backoff < delays.length) {
              const delay = delays[backoff++]
              console.warn(`[llmRouter] ${id} failed (${err.message.slice(0, 120)}) — retrying in ${delay} ms`)
              await sleep(delay)
              continue
            }
            console.warn(`[llmRouter] ${id} failed: ${err.message}`)
            if (shouldCoolDown(err)) keyState.set(id, Date.now() + COOLDOWN_MS)
            // Overloaded model: other keys hit the same servers, so go to the next model
            if (err.status === 503) continue modelLoop
            break // next key
          }

          let data
          try {
            data = req.parse ? req.parse(text) : undefined
          } catch (err) {
            errors.push(`${id}: invalid reply: ${err.message}`)
            console.warn(`[llmRouter] ${id} gave an invalid reply: ${err.message}${parseRetries > 0 ? ' — asking again' : ''}`)
            if (parseRetries > 0) {
              askAgain(text, err.message)
              continue
            }
            continue modelLoop // same model on another key would likely answer the same way
          }
          const ms = Date.now() - started
          console.log(`[llmRouter] ${task} answered by ${name} / ${modelName(model)} (${ms} ms)`)
          return { text, data, provider: name, model: modelName(model), ms }
        }
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
  const models = chosenModels()
  return Object.values(PROVIDERS).map((p) => {
    const keys = p.keyless ? [null] : keysFor(p)
    const cooling = keys.filter((_, i) =>
      [...keyState.keys()].some((id) => id.startsWith(`${p.name}:`) && id.endsWith(`:${i}`) && isCoolingDown(id)),
    ).length
    return { provider: p.name, keys: p.keyless ? 'none needed' : keys.length, coolingDown: cooling, models: models[p.name] }
  })
}

export default { route, status }
