# Conduit — Product Specification

> End-to-end payment routing, split computation, and multi-vendor ledger middleware for East African fintech platforms.

---

## Why This Exists

Digital commerce across Kenya is growing fast — multi-vendor marketplaces, logistics aggregators, property management platforms, and SaaS billing tools all share the same problem: **money comes in as one lump sum but needs to go out to multiple parties.**

The current options are bad:

- **Build it yourself.** You end up writing fragile webhook parsers, hand-rolling split logic with spreadsheets, and discovering double-payout bugs at 2am when a vendor calls angry.
- **Use a PSP directly.** Safaricom's Daraja API, IntaSend, Pay Hero — none of them do multi-party splits natively. You'd have to orchestrate the whole thing.
- **Use a custodial aggregator.** They hold your float, take a cut, and trigger CBK licensing headaches if you cross certain thresholds.

Conduit is the non-custodial middleware layer that sits between your payment gateway and your payout logic. It never holds funds. It just watches for payment confirmations, calculates who gets what, records it in a proper double-entry ledger, and fires off the payouts asynchronously.

---

## Core Concepts

### Platform

A "platform" is any business that collects money on behalf of multiple vendors. Think of it as the merchant-of-record or the marketplace operator. Each platform has its own vendors, split rules, and payout configurations.

### Vendor

A vendor is any party that receives a portion of an incoming payment. Could be a seller on a marketplace, a driver in a logistics app, a landlord in a property platform, or a service provider in an aggregation model.

### Split Rule

Split rules define how an incoming payment gets divided. They support:

- **Percentage splits** — e.g., platform takes 15%, vendor A gets 60%, vendor B gets 25%
- **Fixed commissions** — e.g., platform always takes KES 50 per transaction
- **Tiered fees** — different rates at different volume thresholds (coming later)

Rules are evaluated per-transaction based on the platform's configuration.

### Ledger Entry

Every financial movement is recorded as a double-entry ledger entry. For every debit there's an equal and opposite credit. All amounts are stored as integers (Kenyan cents) to avoid floating-point nonsense.

### Payout Job

After splits are computed and the ledger is updated, each vendor's share becomes a payout job. These get queued and dispatched to external APIs (M-Pesa B2C, bank transfer APIs, etc.) with retry logic.

---

## How The System Works

Here's the flow, step by step:

```
Customer pays → Gateway webhook hits Conduit → Signature verified →
Split computed → Ledger entries written → Payout jobs queued →
Workers dispatch payouts → Status tracked in real-time
```

### 1. Payment Webhook Arrives

A payment gateway (IntaSend, Pay Hero, Daraja) sends a POST to Conduit's ingress endpoint. The payload contains the transaction ID, amount, payer info, and a signature header.

Conduit verifies the signature against the platform's stored secret. If it doesn't match, reject with 401. If we've already seen this transaction ID, return 200 immediately (idempotency).

### 2. Split Calculation

Conduit looks up the platform's split rules and computes the breakdown:

- Total amount: KES 5,000 (500,000 cents)
- Platform commission (15%): KES 750
- Vendor A (55%): KES 2,750
- Vendor B (30%): KES 1,500

Remainder cents (if any) get assigned to the platform. No rounding errors, no drift.

### 3. Ledger Recording

Three ledger entries are written atomically:

| Account        | Debit   | Credit  |
|---------------|---------|---------|
| Platform Pool  | 75,000  |         |
| Vendor A       |         | 275,000 |
| Vendor B       |         | 150,000 |
| Payment Source  |         | 75,000  |

Actually, let me correct that — proper double-entry:

| Entry | Account        | Type  | Amount  |
|-------|---------------|-------|---------|
| 1     | Payment Source | DEBIT | 500,000 |
| 2     | Platform      | CREDIT| 75,000  |
| 3     | Vendor A      | CREDIT| 275,000 |
| 4     | Vendor B      | CREDIT| 150,000 |

Debits = Credits = 500,000. Balanced.

### 4. Payout Dispatch

Each credit entry to a vendor becomes a payout job in the Redis queue. Workers pick these up and call the appropriate external API:

- **M-Pesa B2C** — for mobile money payouts
- **IntaSend Transfer API** — for bank/mobile money
- **Pay Hero disbursements** — for aggregated payouts

If the external API fails, the worker retries with exponential backoff (30s → 5m → 30m). After 3 failures, the job is flagged for manual review.

---

## Data Model

All monetary values are `BIGINT` cents. UUIDs for primary keys. Timestamps are UTC.

### platforms

| Column        | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | UUID         | Primary key                    |
| name         | VARCHAR(255) | Display name                   |
| webhook_secret| VARCHAR(255)| For signature verification     |
| created_at   | TIMESTAMPTZ  |                                |
| updated_at   | TIMESTAMPTZ  |                                |

### vendors

| Column        | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | UUID         | Primary key                    |
| platform_id  | UUID         | FK → platforms                 |
| name         | VARCHAR(255) |                                |
| phone_number | VARCHAR(20)  | For M-Pesa B2C payouts        |
| bank_account | VARCHAR(100) | Optional, for bank transfers   |
| email        | VARCHAR(255) |                                |
| created_at   | TIMESTAMPTZ  |                                |

### split_rules

| Column        | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | UUID         | Primary key                    |
| platform_id  | UUID         | FK → platforms                 |
| vendor_id    | UUID         | FK → vendors                   |
| rule_type    | VARCHAR(20)  | 'percentage' or 'fixed'        |
| value        | BIGINT       | Percentage (basis points) or fixed cents |
| priority     | INTEGER      | Order of evaluation            |
| is_active    | BOOLEAN      | Soft-disable rules             |

### transactions

| Column           | Type         | Notes                          |
|-----------------|--------------|--------------------------------|
| id              | UUID         | Primary key                    |
| platform_id     | UUID         | FK → platforms                 |
| external_ref    | VARCHAR(255) | Gateway transaction ID         |
| amount_cents    | BIGINT       | Total incoming amount          |
| currency        | VARCHAR(3)   | Usually 'KES'                 |
| status          | VARCHAR(20)  | RECEIVED, SPLIT_COMPUTED, PAID_OUT, FAILED |
| raw_payload     | JSONB        | Original webhook body          |
| received_at     | TIMESTAMPTZ  | When the webhook arrived       |
| processed_at    | TIMESTAMPTZ  | When processing completed      |

### ledger_entries

| Column          | Type         | Notes                          |
|----------------|--------------|--------------------------------|
| id             | UUID         | Primary key                    |
| transaction_id | UUID         | FK → transactions              |
| account_name   | VARCHAR(100) | e.g., 'platform_pool', 'vendor:{uuid}' |
| entry_type     | VARCHAR(10)  | DEBIT or CREDIT                |
| amount_cents   | BIGINT       | Always positive                |
| description    | TEXT         | Human-readable description    |
| created_at     | TIMESTAMPTZ  |                                |

### payout_jobs

| Column          | Type         | Notes                          |
|----------------|--------------|--------------------------------|
| id             | UUID         | Primary key                    |
| transaction_id | UUID         | FK → transactions              |
| vendor_id      | UUID         | FK → vendors                   |
| amount_cents   | BIGINT       | Amount to disburse             |
| status         | VARCHAR(20)  | QUEUED, DISPATCHING, COMPLETED, FAILED, MANUAL_REVIEW |
| attempts       | INTEGER      | Number of retry attempts       |
| next_retry_at  | TIMESTAMPTZ  | For backoff scheduling         |
| last_error     | TEXT         | Most recent error message      |
| dispatched_at  | TIMESTAMPTZ  | When the payout was sent       |
| created_at     | TIMESTAMPTZ  |                                |

---

## API Endpoints

### Ingress

| Method | Path                        | Description                        |
|--------|----------------------------|------------------------------------|
| POST   | /api/v1/webhook/ingress    | Receive payment gateway webhooks   |

### Platform Management

| Method | Path                        | Description                        |
|--------|----------------------------|------------------------------------|
| POST   | /api/v1/platforms          | Create a new platform              |
| GET    | /api/v1/platforms/:id      | Get platform details               |
| PUT    | /api/v1/platforms/:id      | Update platform                    |

### Vendor Management

| Method | Path                        | Description                        |
|--------|----------------------------|------------------------------------|
| POST   | /api/v1/platforms/:id/vendors      | Add vendor to platform    |
| GET    | /api/v1/platforms/:id/vendors      | List platform vendors     |
| PUT    | /api/v1/vendors/:id                 | Update vendor details     |

### Split Rules

| Method | Path                        | Description                        |
|--------|----------------------------|------------------------------------|
| POST   | /api/v1/platforms/:id/split-rules  | Create split rule        |
| GET    | /api/v1/platforms/:id/split-rules  | List split rules         |
| PUT    | /api/v1/split-rules/:id            | Update a split rule       |
| DELETE | /api/v1/split-rules/:id            | Deactivate a split rule   |

### Transactions & Ledger

| Method | Path                        | Description                        |
|--------|----------------------------|------------------------------------|
| GET    | /api/v1/transactions               | List transactions (paginated) |
| GET    | /api/v1/transactions/:id           | Transaction detail + splits   |
| GET    | /api/v1/transactions/:id/ledger    | Ledger entries for transaction |
| GET    | /api/v1/payout-jobs                | List payout jobs              |
| GET    | /api/v1/payout-jobs/:id            | Payout job detail             |

### Health

| Method | Path               | Description                |
|--------|-------------------|----------------------------|
| GET    | /health           | Liveness check             |
| GET    | /health/ready     | Readiness check (DB + Redis)|

---

## Webhook Payload Format

Conduit expects webhooks in this shape (adaptable per gateway via a normalization layer):

```json
{
  "transaction_id": "IS-2026-abc123",
  "amount": 5000,
  "currency": "KES",
  "payer_phone": "+254712345678",
  "payer_name": "Jane Muthoni",
  "status": "completed",
  "metadata": {
    "order_id": "ORD-9821",
    "platform_ref": "platform_uuid_here"
  },
  "timestamp": "2026-09-01T14:32:00Z"
}
```

The `metadata.platform_ref` field links the payment to a Conduit platform. This is how we know which split rules to apply.

---

## Error Handling

| Scenario                          | Response       | Action                              |
|----------------------------------|----------------|-------------------------------------|
| Invalid signature                 | 401            | Reject, log security event          |
| Duplicate transaction             | 200 OK         | Idempotent — skip processing        |
| Platform not found                | 404            | Log and reject                      |
| No split rules configured         | 422            | Flag platform for setup             |
| Split calculation error           | 500            | Queue for manual review             |
| Payout API failure                | —              | Retry with backoff, then flag       |
| Database connection failure       | 503            | Health check returns degraded       |

---

## Non-Goals (For Now)

- **Currency conversion** — Conduit works in a single currency per platform. Multi-currency is a future consideration.
- **KYC/AML** — That's the platform's responsibility. Conduit just routes money.
- **Custodial float** — Conduit never holds funds. Period.
- **Mobile SDKs** — This is a server-to-server system. The frontend is a management dashboard, not a consumer app.

---

## Tech Stack Summary

| Layer          | Technology                                    |
|---------------|-----------------------------------------------|
| Backend       | Rust (Axum, Tokio, SQLx, Serde)               |
| Database      | PostgreSQL (ACID, JSONB for raw payloads)     |
| Queue         | Redis (payout job queue, retry scheduling)    |
| Frontend      | Next.js 14, TypeScript, Tailwind CSS          |
| Auth          | JWT (platform API keys for ingress, user tokens for dashboard) |
| Deployment    | Docker Compose → Linux VPS                    |
| Monitoring    | Structured JSON logs → stdout                 |

---

## Success Criteria

1. A platform can register, add vendors, and configure split rules via the dashboard.
2. A payment webhook triggers automatic split computation within 500ms.
3. Ledger entries are balanced and immutable.
4. Payout jobs are dispatched reliably with retries on failure.
5. The dashboard shows real-time transaction status and ledger audit trails.
6. Zero duplicate payouts under concurrent webhook delivery.

---

*Last updated: September 2026*
