# Credence Backend – API Reference

Base URL: `http://localhost:3000` (development)

---

## Authentication

All endpoints are publicly readable.  An optional `X-API-Key` header unlocks
the **premium** rate tier for higher throughput.

| Header      | Value          | Effect                        |
|-------------|----------------|-------------------------------|
| `X-API-Key` | a valid key    | Rate tier: **premium**        |
| _(absent)_  | –              | Rate tier: **standard**       |

---

## Endpoints

### `GET /api/health`

Returns service liveness.

**Response `200`**

```json
{
  "status": "ok",
  "service": "credence-backend"
}
```

---

### `GET /api/trust/:address`

Returns the computed trust score and identity data for an Ethereum address.

**Path parameters**

| Parameter | Type   | Description                                               |
|-----------|--------|-----------------------------------------------------------|
| `address` | string | Ethereum address — `0x`-prefixed, 40 hex chars (EIP-55 or lower-case) |

**Request headers (optional)**

| Header      | Description                          |
|-------------|--------------------------------------|
| `X-API-Key` | API key for premium rate tier        |

**Score algorithm**

The score is an integer in `[0, 100]` computed from three independent
components:

| Component       | Max pts | Reaches max when…         |
|-----------------|---------|---------------------------|
| Bond amount     | 50      | ≥ 1 ETH bonded            |
| Bond duration   | 20      | bonded for ≥ 365 days     |
| Attestations    | 30      | ≥ 5 attestations recorded |

**Successful response `200`**

```json
{
  "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "score": 100,
  "bondedAmount": "1000000000000000000",
  "bondStart": "2024-01-15T00:00:00.000Z",
  "attestationCount": 5,
  "agreedFields": {
    "name": "Alice",
    "role": "validator"
  }
}
```

| Field              | Type            | Description                                                      |
|--------------------|-----------------|------------------------------------------------------------------|
| `address`          | string          | Normalised (lower-case) Ethereum address                         |
| `score`            | integer 0–100   | Computed trust score                                             |
| `bondedAmount`     | string (bigint) | Amount bonded in wei                                             |
| `bondStart`        | string \| null  | ISO 8601 timestamp when the bond was first posted                |
| `attestationCount` | integer         | Number of on-chain attestations                                  |
| `agreedFields`     | object?         | Key/value pairs the identity has explicitly attested to (if any) |

**Error responses**

| Status | Condition                          | Body                                              |
|--------|------------------------------------|---------------------------------------------------|
| `400`  | Address format invalid             | `{ "error": "Invalid address format. …" }`        |
| `404`  | No identity record for this address| `{ "error": "No identity record found for …" }`   |

**Examples**

```bash
# Found identity
curl http://localhost:3000/api/trust/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266

# With API key
curl -H "X-API-Key: my-premium-key" \
     http://localhost:3000/api/trust/0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266

# Not found (valid format, no record)
curl http://localhost:3000/api/trust/0x1234567890123456789012345678901234567890
# → 404

# Invalid format
curl http://localhost:3000/api/trust/not-an-address
# → 400
```

---

### `GET /api/bond/:address`

Returns raw bond status for an address.

> **Note:** This endpoint is currently a stub and will be wired to Horizon
> event ingestion in a future milestone.

**Successful response `200`**

```json
{
  "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "bondedAmount": "0",
  "bondStart": null,
  "bondDuration": null,
  "active": false
}
```

---

## Error format

All errors return a JSON object with a single `error` field:

```json
{ "error": "Human-readable description of what went wrong." }
```
