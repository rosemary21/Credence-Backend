# Database Schema

This document describes the database schema for the Credence Backend.

## Overview

The schema models three core entities in the Credence trust protocol:

- **Identities** — on-chain addresses registered in the system.
- **Attestations** — verifier-issued trust signals linked to identities.
- **Slash Events** — penalty records for protocol violations.

## Entity Relationship

```
identities
  ├── 1:N ──► attestations
  └── 1:N ──► slash_events
```

Both `attestations` and `slash_events` hold a foreign key (`identity_id`) referencing `identities(id)` with `ON DELETE CASCADE`.

## Tables

### identities

| Column     | Type    | Constraints               | Description                 |
| ---------- | ------- | ------------------------- | --------------------------- |
| id         | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique identity ID          |
| address    | TEXT    | NOT NULL, UNIQUE          | On-chain address            |
| created_at | TEXT    | NOT NULL, DEFAULT now()   | ISO 8601 creation timestamp |

### attestations

| Column      | Type    | Constraints                   | Description                     |
| ----------- | ------- | ----------------------------- | ------------------------------- |
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT     | Unique attestation ID           |
| verifier    | TEXT    | NOT NULL                      | Address of the verifier         |
| identity_id | INTEGER | NOT NULL, FK → identities(id) | The attested identity           |
| timestamp   | TEXT    | NOT NULL, DEFAULT now()       | When the attestation was issued |
| weight      | REAL    | NOT NULL, DEFAULT 1.0         | Attestation weight / strength   |
| revoked     | INTEGER | NOT NULL, DEFAULT 0           | 0 = active, 1 = revoked         |
| created_at  | TEXT    | NOT NULL, DEFAULT now()       | ISO 8601 creation timestamp     |

### slash_events

| Column       | Type    | Constraints                   | Description                         |
| ------------ | ------- | ----------------------------- | ----------------------------------- |
| id           | INTEGER | PRIMARY KEY AUTOINCREMENT     | Unique slash event ID               |
| identity_id  | INTEGER | NOT NULL, FK → identities(id) | The slashed identity                |
| amount       | TEXT    | NOT NULL                      | Slash amount (string for precision) |
| reason       | TEXT    | NOT NULL                      | Reason for the slash                |
| evidence_ref | TEXT    | NULLABLE                      | Reference to evidence (e.g. IPFS)   |
| timestamp    | TEXT    | NOT NULL, DEFAULT now()       | When the slash occurred             |
| created_at   | TEXT    | NOT NULL, DEFAULT now()       | ISO 8601 creation timestamp         |

## Migrations

Migrations are idempotent and use `CREATE TABLE IF NOT EXISTS`. They can be run safely multiple times.

To run migrations programmatically:

```typescript
import { createDatabase } from "./src/db/connection.js";
import { runMigrations } from "./src/db/migrations.js";

const db = createDatabase();
runMigrations(db);
```

## Notes

- **SQLite** is used as the initial database engine. The project is designed to migrate to PostgreSQL when the full architecture is implemented.
- **Foreign keys** are enforced via `PRAGMA foreign_keys = ON` set in the connection layer.
- **Cascade deletes** ensure that removing an identity also removes its attestations and slash events.
- **Amount as TEXT**: Slash event amounts are stored as strings to preserve precision for large numbers (e.g. wei values).
