import express from 'express'
import { cache } from './cache/redis.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'credence-backend' })
})

app.get('/api/health/cache', async (_req, res) => {
  const cacheHealth = await cache.healthCheck()
  res.json({
    status: 'ok',
    service: 'credence-backend',
    cache: cacheHealth
  })
})

app.get('/api/trust/:address', (req, res) => {
  const { address } = req.params
  // Placeholder: in production, fetch from DB / reputation engine
  res.json({
    address,
    score: 0,
    bondedAmount: '0',
    bondStart: null,
    attestationCount: 0,
  })
})

app.get('/api/bond/:address', (req, res) => {
  const { address } = req.params
  res.json({
    address,
    bondedAmount: '0',
    bondStart: null,
    bondDuration: null,
    active: false,
  })
})

app.listen(PORT, () => {
  console.log(`Credence API listening on http://localhost:${PORT}`)
})
