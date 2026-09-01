# Conduit

Non-custodial split-payment routing and multi-vendor ledger middleware for East African fintech.

## What is this?

Conduit sits between your payment gateway and your payout logic. It watches for payment confirmation webhooks, computes who gets what based on your split rules, records everything in a double-entry ledger, and fires off the payouts asynchronously.

It never holds funds. It just routes the money and keeps the books.

## The problem it solves

Multi-vendor platforms in Kenya (marketplaces, logistics apps, property management) all deal with the same thing: money comes in as one lump sum but needs to go out to multiple parties. Doing this manually with spreadsheets is slow and error-prone. Doing it yourself with custom scripts means dealing with idempotency, race conditions, and gateway timeout errors.

Conduit handles all of that.

## Tech stack

| Layer    | Tech                                    |
|----------|-----------------------------------------|
| Backend  | Rust, Axum, SQLx, Tokio                 |
| Database | PostgreSQL (ACID, JSONB)                |
| Queue    | Redis (payout job queue)                |
| Frontend | Next.js, TypeScript, Tailwind CSS       |
| Deploy   | Docker Compose → Linux VPS              |

## Getting started

### Prerequisites

- Rust 1.80+ (with cargo)
- Node.js 20+
- Docker + Docker Compose

### 1. Start the database

```bash
docker compose up -d postgres redis
```

### 2. Set up the backend

```bash
cd backend
cp .env.example .env
# edit .env with your actual values

cargo run
```

Migrations run automatically on startup.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be at `http://localhost:3000`.

## API overview

### Webhook ingress

```
POST /api/v1/webhook/ingress
```

This is where your payment gateway sends notifications. The payload includes a `metadata.platform_ref` field that links to a Conduit platform.

### Management endpoints

| Method | Path                                | Description            |
|--------|-------------------------------------|------------------------|
| POST   | /api/v1/platforms                   | Create platform        |
| GET    | /api/v1/platforms/:id               | Get platform           |
| POST   | /api/v1/platforms/:id/vendors       | Add vendor             |
| GET    | /api/v1/platforms/:id/vendors       | List vendors           |
| POST   | /api/v1/platforms/:id/split-rules   | Create split rule      |
| GET    | /api/v1/transactions                | List transactions      |
| GET    | /api/v1/transactions/:id/ledger     | View ledger entries    |
| GET    | /api/v1/payout-jobs                 | List payout jobs       |

## How splits work

Split rules are configured per-platform. Each rule assigns a percentage (in basis points) or fixed amount to a vendor. When a payment arrives:

1. Conduit loads the platform's active split rules
2. Computes each vendor's share
3. Assigns any remainder (rounding) to the platform
4. Writes balanced double-entry ledger entries
5. Queues payout jobs for each vendor share

All amounts are stored as integers (cents) — no floating-point issues.

## Project structure

```
conduit/
├── backend/              # Rust API server
│   ├── src/
│   │   ├── main.rs       # Entry point, router setup
│   │   ├── config.rs     # Environment config
│   │   ├── error.rs      # Unified error types
│   │   ├── handlers/     # HTTP handlers
│   │   ├── models/       # Database models
│   │   └── services/     # Business logic (split engine, payout worker)
│   ├── migrations/       # SQL migrations
│   └── Cargo.toml
├── frontend/             # Next.js dashboard
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # UI components
│   │   └── lib/          # API client, utilities
│   └── package.json
├── docs/
│   └── PRODUCT_SPEC.md   # Full product specification
├── docker-compose.yml
└── README.md
```

## License

TBD — probably MIT or Apache-2.0. We'll decide once there's something worth protecting.
