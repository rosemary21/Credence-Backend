import type { Pool, PoolClient } from "pg";

/**
 * PostgreSQL error code for lock timeout.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_LOCK_TIMEOUT_CODE = "55P03";

/**
 * Predefined lock timeout policies for different transaction types.
 */
export enum LockTimeoutPolicy {
  /** Short timeout for read-only queries (1s default). */
  READONLY = "readonly",
  /** Standard timeout for most operations (2s default). */
  DEFAULT = "default",
  /** Extended timeout for critical operations (10s default). */
  CRITICAL = "critical",
}

/**
 * Thrown when a transaction cannot acquire a lock within the configured timeout.
 */
export class LockTimeoutError extends Error {
  constructor(
    message: string,
    readonly policy: LockTimeoutPolicy | "custom",
    readonly timeoutMs: number,
    readonly originalError?: Error,
  ) {
    super(message);
    this.name = "LockTimeoutError";
  }
}

/**
 * Configuration for lock timeouts (in milliseconds).
 */
export interface LockTimeoutConfig {
  readonly readonly: number;
  readonly default: number;
  readonly critical: number;
}

/**
 * Options for transaction execution.
 */
export interface TransactionOptions {
  /** Lock timeout policy to use. */
  policy?: LockTimeoutPolicy;
  /** Custom timeout in milliseconds (overrides policy). */
  timeoutMs?: number;
  /** Transaction isolation level. */
  isolationLevel?: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
  /** Whether to retry on lock timeout. */
  retryOnLockTimeout?: boolean;
  /** Maximum number of retries (default: 0). */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (default: 100ms). */
  retryDelayMs?: number;
}

/**
 * Default lock timeout configuration.
 */
const DEFAULT_LOCK_TIMEOUTS: LockTimeoutConfig = {
  readonly: 1000,
  default: 2000,
  critical: 10000,
};

/**
 * Manages database transactions with configurable lock timeouts and retry logic.
 */
export class TransactionManager {
  private readonly lockTimeouts: LockTimeoutConfig;

  constructor(
    private readonly pool: Pool,
    lockTimeouts?: Partial<LockTimeoutConfig>,
  ) {
    this.lockTimeouts = { ...DEFAULT_LOCK_TIMEOUTS, ...lockTimeouts };
  }

  /**
   * Execute a function within a database transaction.
   *
   * @param fn - Function to execute within the transaction.
   * @param options - Transaction configuration options.
   * @returns The result of the transaction function.
   * @throws {LockTimeoutError} When lock cannot be acquired within timeout.
   */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const {
      policy = LockTimeoutPolicy.DEFAULT,
      timeoutMs,
      isolationLevel,
      retryOnLockTimeout = false,
      maxRetries = 0,
      retryDelayMs = 100,
    } = options;

    const timeout = timeoutMs ?? this.lockTimeouts[policy];
    const policyName = timeoutMs ? "custom" : policy;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await this.executeTransaction(fn, timeout, isolationLevel);
      } catch (error) {
        const isLockTimeout =
          error instanceof Error &&
          "code" in error &&
          error.code === PG_LOCK_TIMEOUT_CODE;

        if (!isLockTimeout || !retryOnLockTimeout || attempt >= maxRetries) {
          if (isLockTimeout) {
            throw new LockTimeoutError(
              `Lock timeout after ${timeout}ms (policy: ${policyName}, attempt: ${attempt + 1}/${maxRetries + 1})`,
              policyName,
              timeout,
              error as Error,
            );
          }
          throw error;
        }

        lastError = error as Error;
        attempt++;

        // Exponential backoff: retryDelayMs * 2^(attempt-1)
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError ?? new Error("Transaction failed after retries");
  }

  /**
   * Execute a single transaction attempt.
   */
  private async executeTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    timeoutMs: number,
    isolationLevel?: string,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      // Set lock timeout
      await client.query(`SET LOCAL lock_timeout = '${timeoutMs}ms'`);

      // Begin transaction with optional isolation level
      if (isolationLevel) {
        await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
      } else {
        await client.query("BEGIN");
      }

      // Execute transaction function
      const result = await fn(client);

      // Commit transaction
      await client.query("COMMIT");

      return result;
    } catch (error) {
      // Rollback on error
      await client.query("ROLLBACK");
      throw error;
    } finally {
      // Always release client back to pool
      client.release();
    }
  }

  /**
   * Sleep for the specified number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
