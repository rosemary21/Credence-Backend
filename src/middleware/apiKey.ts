/**
 * Optional API key middleware.
 *
 * Reads the `X-API-Key` request header and resolves a rate tier:
 *   - A recognised key  → 'premium'
 *   - No key / unknown  → 'standard'
 *
 * The resolved tier is stored on `res.locals.rateTier` so downstream
 * handlers can apply appropriate rate limits or response enrichments.
 */

import type { Request, Response, NextFunction } from 'express'

export type RateTier = 'standard' | 'premium'

/**
 * Map of valid API keys to their rate tier.
 * In production, load from a secrets store or DB.
 */
const VALID_KEYS = new Map<string, RateTier>([
  [process.env.PREMIUM_API_KEY ?? 'test-premium-key', 'premium'],
])

export function resolveRateTier(apiKey: string | undefined): RateTier {
  if (apiKey && VALID_KEYS.has(apiKey)) {
    return VALID_KEYS.get(apiKey) as RateTier
  }
  return 'standard'
}

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined
  res.locals['rateTier'] = resolveRateTier(apiKey)
  next()
}
