import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import healthRouter from './routes/health.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }))
app.use(express.json({ limit: '15mb' })) // report images arrive as base64

app.use('/api/health', healthRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Revive server listening on http://localhost:${PORT}`)
})
