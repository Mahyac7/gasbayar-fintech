# Gasbayar — Flip-style Interbank Transfer MVP

A small, well-documented MVP that models how an aggregator like **Flip** moves
money between banks: the user deposits into a **settlement account** the service
controls, the service records a **liability** it owes the recipient, then pays
the recipient out via a bank integration. Every movement is recorded in a
**double-entry ledger**.

> ⚠️ **Not for production / not regulated.** Running a real transfer service in
> Indonesia requires a license from Bank Indonesia (PJP/PTD) plus KYC/AML
> controls, security audits, and reconciliation with real banks. This project
> is a learning MVP with a **mock** bank service.

> ⚠️ **Demo storage is in-memory and NOT persistent.** This build keeps all
> data in process memory so it can run on Vercel with zero external services.
> Data resets on every cold start / instance recycle, and different serverless
> instances do not share state. For anything real, swap the store in
> `src/store.ts` for a database (Postgres/Neon).

## Tech stack

- Node.js + TypeScript
- Express (HTTP API)
- In-memory store (`src/store.ts`) — swappable for a real DB
- zod (request validation)
- Deployable to Vercel as a serverless function (`api/index.ts` + `vercel.json`)

## Core concepts demonstrated

| Concept | Where |
|---|---|
| **Double-entry ledger** (every posting sums to zero) | `src/services/ledger.ts` |
| **Transfer state machine** (guarded transitions) | `src/types.ts`, `transition()` in `src/services/transfers.ts` |
| **Idempotency** (safe request retries) | `Idempotency-Key` header → `idempotency_keys` table |
| **Webhook-driven funds detection** | `POST /transfers/:id/funds-received` |
| **Failure + automatic refund** | `disburse()` / `refund()` |
| **Reconciliation check** | `isSystemBalanced()`, exposed on `GET /health` |

Money is stored as **integer minor units** (e.g. rupiah), never floats.

## The money flow

```
CREATED ─▶ AWAITING_FUNDS ─▶ FUNDS_RECEIVED ─▶ DISBURSING ─▶ COMPLETED
                │                                    │
                └▶ EXPIRED                           └▶ FAILED ─▶ REFUNDED
```

1. **Create** — user requests a transfer. We verify the destination account
   (name inquiry) and tell the user which settlement account to deposit into.
   Status → `AWAITING_FUNDS`.
2. **Funds received** — the bank webhook fires when the deposit lands. We post
   to the ledger (settlement account **+**, liability **−**). Status →
   `FUNDS_RECEIVED`, then disbursement begins.
3. **Disburse** — we ask the destination bank to credit the recipient.
   - Success → clear liability, recognise any fee as revenue → `COMPLETED`.
   - Failure → `FAILED` → automatic `REFUNDED` (liability reversed).

## Getting started

```bash
npm install
npm run seed      # create ledger accounts
npm run demo      # run the end-to-end scenarios (no server needed)
```

Run the HTTP API:

```bash
npm run build && npm start        # or: npm run dev
# server on http://localhost:3000
```

### Example API session

```bash
# Create a transfer (idempotent via the header)
curl -s -X POST http://localhost:3000/transfers \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: abc-123' \
  -d '{"amount":150000,"source_bank":"BANK_A","dest_bank":"BANK_B","dest_account_number":"1234567","dest_account_name":"Recipient"}'

# Simulate the bank telling us the deposit arrived (triggers payout)
curl -s -X POST http://localhost:3000/transfers/<TRANSFER_ID>/funds-received

# Inspect the transfer + its ledger entries
curl -s http://localhost:3000/transfers/<TRANSFER_ID>

# Ledger account balances and health
curl -s http://localhost:3000/accounts
curl -s http://localhost:3000/health
```

## Deploying to Vercel

This repo is Vercel-ready. The Express app is exported from `api/index.ts` as a
serverless function, and `vercel.json` rewrites all routes to it.

1. Push this repo to GitHub (already done).
2. On [vercel.com](https://vercel.com), **Add New… → Project** and import the
   `gasbayar-fintech` repo.
3. Framework preset: **Other**. Leave build/output settings at their defaults —
   Vercel auto-detects the `api/` function. No environment variables required.
4. Click **Deploy**. When it finishes, open the deployment URL — the landing
   page (`GET /`) documents the endpoints.

> Remember: this is the **in-memory demo** build. It runs, but state is not
> shared across instances and resets on cold start.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port (local dev only) |
| `MOCK_BANK_FAILURE_RATE` | `0` | Probability (0–1) the mock bank rejects a payout |

Tips for the mock bank (`src/services/mockBank.ts`):
- A destination account number ending in `000` simulates **account not found**.
- Set `MOCK_BANK_FAILURE_RATE=1` to force every payout to fail (and auto-refund).

## Project layout

```
api/
  index.ts               Vercel serverless entrypoint (exports the Express app)
src/
  index.ts               local dev server (app.listen)
  api.ts                 Express routes + landing page
  store.ts               in-memory data store (swap for a DB in production)
  types.ts               domain types + transfer state machine
  services/
    ledger.ts            double-entry ledger
    mockBank.ts          simulated bank (name inquiry + disbursement)
    transfers.ts         transfer orchestration
  scripts/
    seed.ts              seed ledger accounts (illustrative)
    demo.ts              end-to-end walkthrough
vercel.json              routes all requests to the serverless function
```

## Where this is intentionally simplified

Real systems would add: authentication & KYC, per-user wallets, deposit
matching (amount + unique code) so the webhook can identify which transfer a
deposit belongs to, an outbox/queue for reliable async disbursement, retries
with backoff, timeouts/expiry jobs, audit trails, and reconciliation against
bank statements. The code is structured so these can be layered in.
