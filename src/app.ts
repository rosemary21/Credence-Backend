import express from 'express'
import trustRouter from './routes/trust.js'

const app = express()

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'credence-backend' })
})

app.use('/api/trust', trustRouter)

// Bond status endpoint (stub – to be wired to Horizon in a future milestone)
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

export default app
