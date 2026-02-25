# Credence Backend

API and services for the Credence economic trust protocol. Provides health checks, trust score and bond status endpoints (to be wired to Horizon and a reputation engine).

## About

This service is part of [Credence](../README.md). It will support:

- Public query API (trust score, bond status, attestations)
- Horizon listener for bond/slash events (future)
- Reputation engine (off-chain score from bond data) (future)

## Prerequisites

- Node.js 18+
- npm or pnpm
- Redis server (for caching)

## Setup

```bash
npm install
# Set Redis URL in environment
export REDIS_URL=redis://localhost:6379
```

## Run locally

**Development (watch mode):**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

API runs at [http://localhost:3000](http://localhost:3000). The frontend proxies `/api` to this URL.

## Scripts

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start with tsx watch     |
| `npm run build` | Compile TypeScript       |
| `npm start`     | Run compiled `dist/`     |
| `npm run lint`  | Run ESLint               |

## API (current)

| Method | Path               | Description        |
|--------|--------------------|--------------------|
| GET    | `/api/health`      | Health check       |
| GET    | `/api/health/cache` | Redis cache health check |
| GET    | `/api/trust/:address` | Trust score (stub) |
| GET    | `/api/bond/:address`   | Bond status (stub) |

## Caching

The service includes a Redis-based caching layer with:

- **Connection management** - Singleton Redis client with health monitoring
- **Namespacing** - Automatic key namespacing (e.g., `trust:score:0x123`)
- **TTL support** - Set expiration times on cached values
- **Health checks** - Built-in Redis health monitoring
- **Graceful fallback** - Continues working when Redis is unavailable

See [docs/caching.md](./docs/caching.md) for detailed documentation.

## Tech

- Node.js
- TypeScript
- Express
- Redis (caching layer)
- Vitest (testing)

Extend with PostgreSQL and Horizon event ingestion when implementing the full architecture.
