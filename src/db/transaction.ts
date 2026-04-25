import type { Pool, PoolClient } from 'pg'

/** PostgreSQL error code for lock_timeout. */
export const PG_LOCK_TIMEOUT_CODE = '55P03'

/** Named timeout policies with preset durations. */
export enum LockTimeoutPolicy {
  READONLY = 'READONLY',
  DEFAULT = 'DEFAULT',
  CRITICAL = 'CRITICAL',
}

/** Thrown when a lock cannot be acquired within the configured timeout. */
export class LockTimeoutError extends Error {
  constructor(
    public readonly policy: LockTimeoutPolicy | undefined,
    public readonly timeoutMs: number,
    cause?: unknown
  ) {
    super(`Lock timeout after ${timeoutMs}ms (policy: ${policy ?? 'custom'})`)
    this.name = 'LockTimeoutError'
    if (cause) this.cause = cause
  }
}

export interface TransactionOptions {
  /** Named policy; determines the default timeout when timeoutMs is omitted. */
  policy?: LockTimeoutPolicy
  /** Explicit lock timeout in milliseconds; overrides policy default. */
  timeoutMs?: number
  /** PostgreSQL isolation level. Defaults to READ COMMITTED. */
  isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'
  /** Retry the transaction when a lock timeout occurs. */
  retryOnLockTimeout?: boolean
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number
  /** Base delay between retries in ms; doubles on each attempt (default: 50). */
  retryDelayMs?: number
}

const POLICY_TIMEOUTS: Record<LockTimeoutPolicy, number> = {
  [LockTimeoutPolicy.READONLY]: 1000,
  [LockTimeoutPolicy.DEFAULT]: 2000,
  [LockTimeoutPolicy.CRITICAL]: 10_000,
}

function resolveTimeout(options: TransactionOptions): number {
  if (options.timeoutMs !== undefined) return options.timeoutMs
  if (options.policy !== undefined) return POLICY_TIMEOUTS[options.policy]
  return POLICY_TIMEOUTS[LockTimeoutPolicy.DEFAULT]
}

function isLockTimeoutError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === PG_LOCK_TIMEOUT_CODE
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class TransactionManager {
  constructor(
    private readonly pool: Pool,
    private readonly defaultTimeouts?: {
      readonly: number
      default: number
      critical: number
    }
  ) {}

  /**
   * Executes `fn` inside a PostgreSQL transaction with configurable lock
   * timeout, isolation level, and optional retry on lock timeout.
   */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const timeoutMs = this.resolveTimeoutMs(options)
    const maxRetries = options.retryOnLockTimeout ? (options.maxRetries ?? 3) : 0
    const retryDelayMs = options.retryDelayMs ?? 50

    let attempt = 0
    while (true) {
      const client = await this.pool.connect()
      try {
        // Set lock timeout before starting the transaction.
        const timeoutSecs = Math.ceil(timeoutMs / 1000)
        await client.query(`SET LOCAL lock_timeout = '${timeoutSecs}s'`)

        const isolationLevel = options.isolationLevel ?? 'READ COMMITTED'
        await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`)

        try {
          const result = await fn(client)
          await client.query('COMMIT')
          return result
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        }
      } catch (err) {
        if (isLockTimeoutError(err) && attempt < maxRetries) {
          attempt++
          const delay = retryDelayMs * Math.pow(2, attempt - 1)
          await sleep(delay)
          continue
        }

        if (isLockTimeoutError(err)) {
          throw new LockTimeoutError(options.policy, timeoutMs, err)
        }

        throw err
      } finally {
        client.release()
      }
    }
  }

  private resolveTimeoutMs(options: TransactionOptions): number {
    if (options.timeoutMs !== undefined) return options.timeoutMs
    if (options.policy !== undefined) {
      if (this.defaultTimeouts) {
        const map: Record<LockTimeoutPolicy, number> = {
          [LockTimeoutPolicy.READONLY]: this.defaultTimeouts.readonly,
          [LockTimeoutPolicy.DEFAULT]: this.defaultTimeouts.default,
          [LockTimeoutPolicy.CRITICAL]: this.defaultTimeouts.critical,
        }
        return map[options.policy]
      }
      return POLICY_TIMEOUTS[options.policy]
    }
    return this.defaultTimeouts?.default ?? POLICY_TIMEOUTS[LockTimeoutPolicy.DEFAULT]
  }
}
