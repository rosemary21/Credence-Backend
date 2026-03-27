import { createHmac } from 'crypto'
import type { WebhookConfig, WebhookPayload, WebhookDeliveryResult } from './types.js'

/**
 * Options for webhook delivery.
 */
export interface DeliveryOptions {
  /** Maximum retry attempts (default: 3). */
  maxRetries?: number
  /** Initial retry delay in ms (default: 1000). */
  initialDelay?: number
  /** Backoff multiplier (default: 2). */
  backoffMultiplier?: number
  /** Request timeout in ms (default: 5000). */
  timeout?: number
}

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

/**
 * Deliver webhook with retry and exponential backoff.
 */
export async function deliverWebhook(
  webhook: WebhookConfig,
  payload: WebhookPayload,
  options: DeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    timeout = 5000,
  } = options

  const payloadStr = JSON.stringify(payload)
  
  // SUPPORT DUAL SIGNATURES DURING GRACE PERIOD
  const signatures: string[] = [signPayload(payloadStr, webhook.secret)]
  
  if (webhook.previousSecret) {
    const now = Date.now()
    const rotatedAt = webhook.secretUpdatedAt.getTime()
    if (now - rotatedAt < GRACE_PERIOD_MS) {
      signatures.push(signPayload(payloadStr, webhook.previousSecret))
    }
  }

  const signatureHeader = signatures.join(',')

  let attempts = 0
  let lastError: string | undefined

  for (let i = 0; i <= maxRetries; i++) {
    attempts++
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signatureHeader,
          'X-Webhook-Event': payload.event,
        },
        body: payloadStr,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return {
          webhookId: webhook.id,
          success: true,
          statusCode: response.status,
          attempts,
        }
      }

      lastError = `HTTP ${response.status}`
      
      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        break
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error'
    }

    // Wait before retry (except on last attempt)
    if (i < maxRetries) {
      const delay = initialDelay * Math.pow(backoffMultiplier, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return {
    webhookId: webhook.id,
    success: false,
    error: lastError,
    attempts,
  }
}
