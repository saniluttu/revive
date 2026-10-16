// Which model each provider uses. Names come from env vars; at startup we check
// them against each provider's model list and auto-pick where needed:
//   - OpenRouter: free models only (zero prompt + completion price), one list for
//     text and one for vision, unless OPENROUTER_MODEL / OPENROUTER_VISION_MODEL is set
//   - Groq: a vision model if Groq currently has one, otherwise Groq is skipped for vision
//   - Gemini / Groq text: if the configured model is gone, log it and pick a current one
//   - Gemini fallback: a second flash / flash-lite model tried before leaving Gemini
//     (GEMINI_FALLBACK_MODEL overrides)
//   - Ollama (local, text only): used only if GET /api/tags answers at startup and
//     OLLAMA_MODEL is pulled; otherwise skipped

const LIST_TIMEOUT_MS = 10_000
const OPENROUTER_FALLBACKS = 3 // OpenRouter tries these in order (`models` param)

export const DEFAULTS = {
  GEMINI_MODEL: 'gemini-3.8-flash',
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  GROQ_REPORT_MODEL: 'openai/gpt-oss-120b',
  OLLAMA_MODEL: 'qwen2.5:3b',
  OLLAMA_URL: 'http://localhost:11434',
}

export const ollamaUrl = () => (process.env.OLLAMA_URL?.trim() || DEFAULTS.OLLAMA_URL).replace(/\/+$/, '')
const OLLAMA_CHECK_TIMEOUT_MS = 3_000

// Env var to change when a provider's model for a task is wrong
// (`index` 1 = Gemini's fallback model)
export function modelEnvVar(provider, task, index = 0) {
  const vision = task === 'vision'
  if (provider === 'ollama') return 'OLLAMA_MODEL'
  if (provider === 'gemini') return index > 0 ? 'GEMINI_FALLBACK_MODEL' : 'GEMINI_MODEL'
  if (provider === 'groq') return vision ? 'GROQ_VISION_MODEL' : task === 'report' ? 'GROQ_REPORT_MODEL' : 'GROQ_MODEL'
  return vision ? 'OPENROUTER_VISION_MODEL' : 'OPENROUTER_MODEL'
}

const env = (name) => process.env[name]?.trim() || null

// provider -> { text, vision }: a model id, a list of ids (OpenRouter), or null (unavailable).
// Gemini also has `fallback`, used for every task; Groq has `report` (report text → JSON).
// Other providers use their text model for the report task. Ollama stays null
// (skipped) until initModels() has found it running with the model pulled.
const chosen = {
  ollama: { text: null, vision: null },
  gemini: { text: null, vision: null, fallback: null },
  groq: { text: null, vision: null, report: null },
  openrouter: { text: null, vision: null },
}
let discovered = false

// Before (or without) discovery, use the env vars / defaults as they are
function fromEnv() {
  const gemini = env('GEMINI_MODEL') ?? DEFAULTS.GEMINI_MODEL
  return {
    ollama: { text: null, vision: null },
    gemini: { text: gemini, vision: gemini, fallback: env('GEMINI_FALLBACK_MODEL') },
    groq: {
      text: env('GROQ_MODEL') ?? DEFAULTS.GROQ_MODEL,
      vision: env('GROQ_VISION_MODEL'),
      report: env('GROQ_REPORT_MODEL') ?? DEFAULTS.GROQ_REPORT_MODEL,
    },
    openrouter: { text: env('OPENROUTER_MODEL'), vision: env('OPENROUTER_VISION_MODEL') },
  }
}

/** @returns {string|string[]|null} */
export function modelFor(provider, task) {
  const models = (discovered ? chosen : fromEnv())[provider]
  if (!models) return null
  if (task === 'vision') return models.vision ?? null
  if (task === 'report' && models.report !== undefined) return models.report ?? models.text ?? null
  return models.text ?? null
}

/**
 * Models to try in order for a provider + task. Each entry is one request's
 * `model` (for OpenRouter an array: it falls back through them itself).
 */
export function modelsFor(provider, task) {
  const primary = modelFor(provider, task)
  if (!primary) return []
  if (provider !== 'gemini') return [primary]
  const fallback = (discovered ? chosen : fromEnv()).gemini.fallback
  return fallback && fallback !== primary ? [primary, fallback] : [primary]
}

export function chosenModels() {
  return discovered ? chosen : fromEnv()
}

// ---------- pickers (pure, exported for tests) ----------

// "nemotron-3-super-120b-a12b" -> 120; ids without a size -> 0
function paramBillions(id) {
  const sizes = [...id.matchAll(/(\d+(?:\.\d+)?)b(?![a-z])/gi)].map((m) => Number(m[1]))
  return sizes.length ? Math.max(...sizes) : 0
}

// Every listed price is exactly zero (OpenRouter uses "-1" for variable pricing)
function isFree(model) {
  const pricing = model.pricing
  if (!pricing || pricing.prompt == null || pricing.completion == null) return false
  return Object.values(pricing).every((p) => Number(p) === 0)
}

const OPENROUTER_EXCLUDE = /safety|guard|moderation|embed|code|coder|^openrouter\//i
const SOON_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Free OpenRouter models, best first. Vision models must accept images.
 * @param {object[]} models data[] from GET /api/v1/models
 * @returns {{ text: string[], vision: string[] }}
 */
export function pickOpenRouterModels(models, now = Date.now()) {
  const usable = models.filter((m) => {
    const arch = m.architecture ?? {}
    const out = arch.output_modalities ?? ['text']
    if (!isFree(m) || OPENROUTER_EXCLUDE.test(m.id)) return false
    if (out.length !== 1 || out[0] !== 'text') return false // e.g. music / image generators
    if (!(arch.input_modalities ?? ['text']).includes('text')) return false
    if (m.expiration_date && new Date(m.expiration_date).getTime() - now < SOON_MS) return false
    return true
  })
  const score = (m) =>
    ((m.supported_parameters ?? []).includes('response_format') ? 10_000 : 0) + Math.min(paramBillions(m.id), 1000)
  const ranked = usable.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
  return {
    text: ranked.map((m) => m.id),
    vision: ranked.filter((m) => m.architecture?.input_modalities?.includes('image')).map((m) => m.id),
  }
}

const GROQ_NOT_CHAT = /whisper|tts|orpheus|playai|guard|distil|compound|allam/i
const GROQ_VISION = /llama-4|vision|-vl\b|scout|maverick/i

/**
 * @param {object[]} models data[] from GET /openai/v1/models
 * @returns {{ text: string[], vision: string[] }} best first
 */
export function pickGroqModels(models) {
  const chat = models
    .filter((m) => m.active !== false && !GROQ_NOT_CHAT.test(m.id))
    .sort((a, b) => paramBillions(b.id) - paramBillions(a.id) || a.id.localeCompare(b.id))
    .map((m) => m.id)
  return { text: chat, vision: chat.filter((id) => GROQ_VISION.test(id)) }
}

/**
 * Gemini "flash" models that can generateContent, newest stable first.
 * @param {object[]} models models[] from GET /v1beta/models
 */
export function pickGeminiModels(models) {
  const version = (id) => Number(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => /^gemini-[\d.]+-flash/.test(id) && !/lite|image|tts|live|audio|thinking/.test(id))
    .sort((a, b) => {
      const preview = (id) => (/preview|exp/.test(id) ? 1 : 0)
      return version(b) - version(a) || preview(a) - preview(b) || a.length - b.length
    })
}

/**
 * A second Gemini model for when the primary is overloaded: another current
 * flash or flash-lite model, stable before preview, newest first, flash before lite.
 */
export function pickGeminiFallback(models, primary) {
  const version = (id) => Number(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
  const preview = (id) => (/preview|exp/.test(id) ? 1 : 0)
  const lite = (id) => (/lite/.test(id) ? 1 : 0)
  return (
    models
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => id !== primary && /^gemini-[\d.]+-flash/.test(id) && !/image|tts|live|audio|thinking/.test(id))
      .sort((a, b) => preview(a) - preview(b) || version(b) - version(a) || lite(a) - lite(b) || a.length - b.length)[0] ??
    null
  )
}

// ---------- discovery ----------

const firstKey = (envKey) => env(envKey)?.split(',')[0]?.trim() || null

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function discoverGemini(base) {
  const configured = base.gemini.text
  const key = firstKey('GEMINI_API_KEYS')
  if (!key) return base.gemini
  const { models = [] } = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    'x-goog-api-key': key,
  })
  const available = models.map((m) => m.name.replace(/^models\//, ''))

  let primary = configured
  if (!available.includes(configured)) {
    const pick = pickGeminiModels(models)[0] ?? null
    console.warn(
      `[models] Gemini model "${configured}" is not available. Set GEMINI_MODEL in server/.env` +
        (pick ? ` — using "${pick}" for now.` : '.'),
    )
    primary = pick ?? configured
  }

  let fallback = base.gemini.fallback
  if (fallback && !available.includes(fallback)) {
    console.warn(`[models] Gemini fallback model "${fallback}" is not available. Set GEMINI_FALLBACK_MODEL in server/.env — auto-picking one.`)
    fallback = null
  }
  fallback ??= pickGeminiFallback(models, primary)
  return { text: primary, vision: primary, fallback }
}

async function discoverGroq(base) {
  const key = firstKey('GROQ_API_KEYS')
  if (!key) return base.groq
  const { data = [] } = await getJson('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` })
  const ids = data.filter((m) => m.active !== false).map((m) => m.id)
  const picks = pickGroqModels(data)

  let text = base.groq.text
  if (!ids.includes(text)) {
    const pick = picks.text[0] ?? null
    console.warn(`[models] Groq model "${text}" is not available. Set GROQ_MODEL in server/.env` + (pick ? ` — using "${pick}" for now.` : '.'))
    text = pick
  }

  let vision = base.groq.vision
  if (vision && !ids.includes(vision)) {
    console.warn(`[models] Groq vision model "${vision}" is not available. Set GROQ_VISION_MODEL in server/.env.`)
    vision = null
  }
  vision ??= picks.vision[0] ?? null
  if (!vision) console.log('[models] Groq has no vision model right now — skipping Groq for report images.')

  let report = base.groq.report
  if (!ids.includes(report)) {
    console.warn(`[models] Groq report model "${report}" is not available. Set GROQ_REPORT_MODEL in server/.env — using "${text}" for now.`)
    report = text
  }
  return { text, vision, report }
}

async function discoverOpenRouter(base) {
  const key = firstKey('OPENROUTER_API_KEYS')
  const { data = [] } = await getJson('https://openrouter.ai/api/v1/models', key ? { Authorization: `Bearer ${key}` } : {})
  const picks = pickOpenRouterModels(data)
  const byId = new Map(data.map((m) => [m.id, m]))

  // A configured model is used only if it is free; we never call a paid model
  const checkConfigured = (id, envName, auto) => {
    if (!id) return auto
    const model = byId.get(id)
    if (!model) {
      console.warn(`[models] OpenRouter model "${id}" not found. Set ${envName} in server/.env (or leave it empty to auto-pick).`)
      return auto
    }
    if (!isFree(model)) {
      console.warn(`[models] OpenRouter model "${id}" is not free — ignoring ${envName}, auto-picking a free one.`)
      return auto
    }
    return [id]
  }
  const text = checkConfigured(base.openrouter.text, 'OPENROUTER_MODEL', picks.text.slice(0, OPENROUTER_FALLBACKS))
  const vision = checkConfigured(base.openrouter.vision, 'OPENROUTER_VISION_MODEL', picks.vision.slice(0, OPENROUTER_FALLBACKS))
  return { text: text.length ? text : null, vision: vision.length ? vision : null }
}

// Local Ollama: is it running, and is the model pulled? Never throws.
async function discoverOllama() {
  const model = env('OLLAMA_MODEL') ?? DEFAULTS.OLLAMA_MODEL
  const off = { text: null, vision: null }
  let models
  try {
    const res = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(OLLAMA_CHECK_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    ;({ models = [] } = await res.json())
  } catch (err) {
    console.log(`[models] Ollama is not running at ${ollamaUrl()} (${err.cause?.code ?? err.message}) — skipping it.`)
    return off
  }
  const names = models.flatMap((m) => [m.name, m.model]).filter(Boolean)
  const found = names.find((n) => n === model || n === `${model}:latest`)
  if (!found) {
    console.warn(`[models] Ollama model "${model}" is not pulled — run \`ollama pull ${model}\` or set OLLAMA_MODEL in server/.env. Skipping Ollama.`)
    return off
  }
  return { text: found, vision: null } // text tasks only; images never go to Ollama
}

/** Checks/picks models for every provider. Never throws; failures keep the env values. */
export async function initModels() {
  const base = fromEnv()
  const run = async (name, fn) => {
    try {
      return await fn(base)
    } catch (err) {
      console.warn(`[models] could not list ${name} models (${err.message}) — using configured values.`)
      // Without the list we can't confirm an OpenRouter model is free, so only use configured ones
      return base[name]
    }
  }
  const [ollama, gemini, groq, openrouter] = await Promise.all([
    discoverOllama(),
    run('gemini', discoverGemini),
    run('groq', discoverGroq),
    run('openrouter', discoverOpenRouter),
  ])
  Object.assign(chosen, { ollama, gemini, groq, openrouter })
  discovered = true

  const show = (v) => (Array.isArray(v) ? v.join(' → ') : (v ?? 'none'))
  for (const [name, m] of Object.entries(chosen)) {
    const fallback = m.fallback !== undefined ? `; fallback = ${show(m.fallback)}` : ''
    const report = m.report !== undefined ? `; report = ${show(m.report)}` : ''
    console.log(`[models] ${name}: text = ${show(m.text)}; vision = ${show(m.vision)}${report}${fallback}`)
  }
}
