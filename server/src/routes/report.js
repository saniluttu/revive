import { Router } from 'express'
import { route } from '../llm/llmRouter.js'
import { parseAnalysis, SYSTEM_PROMPT, USER_PROMPT } from '../report/analysis.js'
import { getCached, hashFile, saveCached } from '../report/cache.js'

const router = Router()

// What the AI providers are sent: PDFs, JPEGs and PNGs (the client converts other images to JPEG)
// Detected from the file's first bytes, not the browser-reported type.
function sniffType(bytes) {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}
const MAX_BYTES = 10 * 1024 * 1024

// POST /api/report/analyze  { file: { name, mimeType, data (base64) } }
// → { analysis, provider, cached?, message? }
router.post('/analyze', async (req, res) => {
  const { name, data } = req.body?.file ?? {}
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'unsupported_file' })
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'file_too_large' })
  const mimeType = sniffType(bytes)
  if (!mimeType) return res.status(400).json({ error: 'unsupported_file' })

  const hash = hashFile(bytes)
  const result = await route({
    task: 'vision',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT }],
    images: [{ name, mimeType, data }],
    json: true,
    parse: parseAnalysis,
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
