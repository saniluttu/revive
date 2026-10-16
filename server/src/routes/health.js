import { Router } from 'express'
import { status } from '../llm/llmRouter.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json({ ok: true, service: 'revive-server', time: new Date().toISOString(), llm: status() })
})

export default router
