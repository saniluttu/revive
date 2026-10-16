import { Router } from 'express'
import { MAX_QUESTION_CHARS, parseReply, systemPrompt, toMessages } from '../chat/assistant.js'
import { route } from '../llm/llmRouter.js'
import { hasRedFlag } from '../voice/redFlags.js'

const router = Router()

// POST /api/chat
//   { question, lang: 'ml'|'en', exerciseId?, plan?: [{ exerciseId, reps, sets }], history?: [{ role, content }] }
// → { reply, redFlag: false, provider }
//   { reply: null, redFlag: true }          the client shows/speaks its "stop and contact your doctor" text
//   { error } with 400 / 503
router.post('/', async (req, res) => {
  const { question, lang: rawLang, exerciseId, plan, history } = req.body ?? {}
  const text = typeof question === 'string' ? question.trim() : ''
  if (!text) return res.status(400).json({ error: 'empty_question' })
  if (text.length > MAX_QUESTION_CHARS) return res.status(400).json({ error: 'question_too_long' })
  const lang = rawLang === 'ml' ? 'ml' : 'en'

  if (hasRedFlag(text)) {
    console.log('[chat] red-flag symptom in question — answering "stop and contact your doctor"')
    return res.json({ reply: null, redFlag: true })
  }

  const result = await route({
    task: 'chat',
    system: systemPrompt({
      lang,
      exerciseId: typeof exerciseId === 'string' ? exerciseId : null,
      plan: Array.isArray(plan) ? plan : [],
    }),
    messages: toMessages(history, text),
    json: true,
    parse: parseReply,
    parseRetries: 1,
  })
  if (result.fallback) return res.status(503).json({ error: 'ai_unavailable' })
  const { reply, redFlag } = result.data
  res.json(redFlag ? { reply: null, redFlag: true } : { reply, redFlag: false, provider: result.provider })
})

export default router
