import express from 'express'
import { generateApiKey, revokeApiKey, rotateApiKey, listApiKeys } from './services/apiKeys.js'
import { requireApiKey } from './middleware/apiKey.js'
import { createHealthRouter } from './routes/health.js'
import { createDefaultProbes } from './services/health/probes.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'credence-backend' })
})
const healthProbes = createDefaultProbes()
app.use('/api/health', createHealthRouter(healthProbes))

// ── API Key Management ────────────────────────────────────────────────────────

/** POST /api/keys — issue a new API key */
app.post('/api/keys', (req, res) => {
  const { ownerId, scope, tier } = req.body as {
    ownerId?: string
    scope?: string
    tier?: string
  }

  if (!ownerId) {
    res.status(400).json({ error: 'ownerId is required' })
    return
  }

  const validScopes = ['read', 'full']
  const validTiers = ['free', 'pro', 'enterprise']

  if (scope && !validScopes.includes(scope)) {
    res.status(400).json({ error: `scope must be one of: ${validScopes.join(', ')}` })
    return
  }
  if (tier && !validTiers.includes(tier)) {
    res.status(400).json({ error: `tier must be one of: ${validTiers.join(', ')}` })
    return
  }

  const result = generateApiKey(
    ownerId,
    (scope as 'read' | 'full') ?? 'read',
    (tier as 'free' | 'pro' | 'enterprise') ?? 'free',
  )

  res.status(201).json(result)
})

/** GET /api/keys?ownerId=<id> — list keys for an owner */
app.get('/api/keys', (req, res) => {
  const { ownerId } = req.query as { ownerId?: string }
  if (!ownerId) {
    res.status(400).json({ error: 'ownerId query parameter is required' })
    return
  }
  res.json(listApiKeys(ownerId))
})

/** DELETE /api/keys/:id — revoke a key */
app.delete('/api/keys/:id', (req, res) => {
  const revoked = revokeApiKey(req.params['id'])
  if (!revoked) {
    res.status(404).json({ error: 'Key not found' })
    return
  }
  res.status(204).send()
})

/** POST /api/keys/:id/rotate — rotate a key */
app.post('/api/keys/:id/rotate', (req, res) => {
  const result = rotateApiKey(req.params['id'])
  if (!result) {
    res.status(404).json({ error: 'Key not found or already revoked' })
    return
  }
  res.json(result)
})

// ── Protected Endpoints ───────────────────────────────────────────────────────

app.get('/api/trust/:address', requireApiKey(), (req, res) => {
  const { address } = req.params
  res.json({
    address,
    score: 0,
    bondedAmount: '0',
    bondStart: null,
    attestationCount: 0,
    _accessedWith: { scope: req.apiKey?.scope, tier: req.apiKey?.tier },
  })
})

app.get('/api/bond/:address', requireApiKey(), (req, res) => {
  const { address } = req.params
  res.json({
    address,
    bondedAmount: '0',
    bondStart: null,
    bondDuration: null,
    active: false,
    _accessedWith: { scope: req.apiKey?.scope, tier: req.apiKey?.tier },
  })
})

// Bulk verification endpoint (Enterprise)
app.use('/api/bulk', bulkRouter)

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Credence API listening on http://localhost:${PORT}`)
  })
}

export default app
