import { Router } from 'express'
import { route } from '../llm/llmRouter.js'
import { parseAnalysis, PROMPT_VERSION, SYSTEM_PROMPT, USER_PROMPT } from '../report/analysis.js'
import { getCached, hashFile, saveCached } from '../report/cache.js'

const router = Router()

// DEMO_MODE=true: a file analysed before is always answered from the cache, even if
// the prompt has changed since. Otherwise a cached answer is reused only if it was
// made with the current prompt — but any cached answer beats failing.
const demoMode = () => /^(1|true|yes)$/i.test(process.env.DEMO_MODE ?? '')
if (demoMode()) console.log('[report] DEMO_MODE on — known report files are always answered from the cache')

// What the AI providers are sent: PDFs, JPEGs and PNGs (the client converts other images to JPEG)
// Detected from the file's first bytes, not the browser-reported type.
function sniffType(bytes) {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}
const MAX_BYTES = 10 * 1024 * 1024

const fromCache = (entry, message) => ({
  analysis: entry.analysis,
  provider: entry.provider,
  cached: true,
  ...(message && { message }),
})

// POST /api/report/analyze  { file: { name, mimeType, data (base64) } }
// → { analysis, provider, cached?, message? }  or  { error } with 4xx/503
//
// With `Accept: application/x-ndjson` the reply is streamed, one JSON per line, so
// the page can show progress while the AI is retried:
//   { "type": "retrying", "provider": "gemini" }   (zero or more)
//   { "type": "result", ...reply }  or  { "type": "error", "error": "ai_unavailable" }
router.post('/analyze', async (req, res) => {
  const { name, data } = req.body?.file ?? {}
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'unsupported_file' })
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'file_too_large' })
  const mimeType = sniffType(bytes)
  if (!mimeType) return res.status(400).json({ error: 'unsupported_file' })

  const hash = hashFile(bytes)
  const cached = await getCached(hash)
  if (cached && (demoMode() || cached.promptVersion === PROMPT_VERSION)) {
    console.log(`[report] known file — serving cached analysis from ${cached.savedAt}`)
    return res.json(fromCache(cached))
  }

  const stream = Boolean(req.get('accept')?.includes('application/x-ndjson'))
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`)
  if (stream) {
    res.status(200).type('application/x-ndjson')
    res.flushHeaders()
  }

  const result = await route({
    task: 'vision',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT }],
    images: [{ name, mimeType, data }],
    json: true,
    parse: parseAnalysis,
    onEvent: stream ? (e) => send({ type: e.type, provider: e.provider }) : undefined,
  })

  let reply
  let error = null
  if (!result.fallback) {
    await saveCached(hash, { analysis: result.data, provider: result.provider, model: result.model, promptVersion: PROMPT_VERSION })
    reply = { analysis: result.data, provider: result.provider }
  } else if (cached) {
    console.log(`[report] all providers failed — serving cached analysis from ${cached.savedAt}`)
    reply = fromCache(cached, result.message)
  } else {
    error = 'ai_unavailable'
  }

  if (stream) {
    send(error ? { type: 'error', error } : { type: 'result', ...reply })
    return res.end()
  }
  if (error) return res.status(503).json({ error })
  res.json(reply)
})

export default router
