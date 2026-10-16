import { Router } from 'express'
import { route } from '../llm/llmRouter.js'
import { parseAnalysis, SYSTEM_PROMPT, USER_PROMPT } from '../report/analysis.js'
import { getCached, hashFile, saveCached } from '../report/cache.js'

const router = Router()

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024
const VISION_TIMEOUT_MS = 45_000 // reading a PDF takes longer than a chat reply

// POST /api/report/analyze  { file: { name, mimeType, data (base64) } }
// → { analysis, provider, cached?, message? }
router.post('/analyze', async (req, res) => {
  const { name, mimeType, data } = req.body?.file ?? {}
  if (!ALLOWED_TYPES.includes(mimeType) || typeof data !== 'string' || !data) {
    return res.status(400).json({ error: 'unsupported_file' })
  }
  const bytes = Buffer.from(data, 'base64')
  if (!bytes.length) return res.status(400).json({ error: 'unsupported_file' })
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'file_too_large' })

  const hash = hashFile(bytes)
  const result = await route({
    task: 'vision',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT }],
    images: [{ name, mimeType, data }],
    json: true,
    parse: parseAnalysis,
    timeoutMs: VISION_TIMEOUT_MS,
  })

  if (!result.fallback) {
    await saveCached(hash, { analysis: result.data, provider: result.provider })
    return res.json({ analysis: result.data, provider: result.provider })
  }

  const cached = await getCached(hash)
  if (cached) {
    console.log(`[report] all providers failed — serving cached analysis from ${cached.savedAt}`)
    return res.json({ analysis: cached.analysis, provider: cached.provider, cached: true, message: result.message })
  }
  res.status(503).json({ error: 'ai_unavailable' })
})

export default router
