import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { initModels } from './llm/models.js'
import healthRouter from './routes/health.js'
import reportRouter from './routes/report.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }))
app.use(express.json({ limit: '15mb' })) // report images arrive as base64

app.use('/api/health', healthRouter)
app.use('/api/report', reportRouter)

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'file_too_large' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
})

await initModels() // check/pick model names before taking requests

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Revive server listening on http://localhost:${PORT}`)
})
