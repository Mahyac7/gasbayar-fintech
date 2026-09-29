# Gasbayar — Flip-style Interbank Transfer MVP

A full-stack **Next.js** demo that models how an aggregator like **Flip** moves
money between banks: the user deposits into a **settlement account** the service
controls, the service records a **liability** it owes the recipient, then pays
the recipient out via a bank integration. Every movement is recorded in a
**double-entry ledger**.

Now with a complete web UI: create transfers, watch them move through the state
machine, trigger the deposit webhook, and inspect the ledger — all in the
browser.

> ⚠️ **Not for production / not regulated.** A real transfer service in
> Indonesia requires a Bank Indonesia license (PJP/PTD), KYC/AML controls,
> security audits, and reconciliation with real banks. This is a learning MVP
> with a **mock** bank service.

> ⚠️ **Demo storage is in-memory and NOT persistent.** All data lives in
> process memory so the app runs on Vercel with zero external services. It
> resets on every cold start and is not shared across serverless instances. For
> anything real, swap the store in `lib/store.ts` for a database (Postgres/Neon).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** for the UI
- **SWR** for client data fetching
- **zod** for request validation
- In-memory store (`lib/store.ts`) — swappable for a real DB
- Deploys to **Vercel** with zero configuration (Next.js is auto-detected)

## What you can do in the UI

| Page | What it does |
|---|---|
| `/` | **Create a transfer** — form with amount, banks, destination account |
| `/transfers` | **List** all transfers with live status (auto-refreshing) |
| `/transfers/[id]` | **Detail** — status, ledger entries, and a button to simulate the deposit webhook |
| `/accounts` | **Ledger dashboard** — account balances + a live "is the ledger balanced?" check |

## The money flow (state machine)

```
CREATED ─▶ AWAITING_FUNDS ─▶ FUNDS_RECEIVED ─▶ DISBURSING ─▶ COMPLETED
                │                                    │
                └▶ EXPIRED                           └▶ FAILED ─▶ REFUNDED
```

1. **Create** — verify the destination account (name inquiry) → `AWAITING_FUNDS`.
2. **Funds received** — the deposit webhook fires; we post to the ledger
   (settlement **+**, liability **−**) → `FUNDS_RECEIVED`, then disburse.
3. **Disburse** — pay the recipient.
   - Success → clear liability, recognise any fee → `COMPLETED`.
   - Failure → `FAILED` → automatic `REFUNDED`.

Money is stored as **integer minor units** (rupiah), never floats.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm start        # run the production build
npm run demo     # end-to-end flow in the terminal (no server needed)
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | health + ledger-balanced check |
| `GET` | `/api/accounts` | ledger accounts and balances |
| `POST` | `/api/transfers` | create a transfer (header `Idempotency-Key`) |
| `GET` | `/api/transfers` | list transfers |
| `GET` | `/api/transfers/:id` | one transfer + its ledger entries |
| `POST` | `/api/transfers/:id/funds-received` | deposit webhook → triggers payout |

## Deploying to Vercel

1. Push to GitHub (already wired to `Mahyac7/gasbayar-fintech`).
2. On [vercel.com](https://vercel.com): **Add New… → Project** → import the repo.
3. Vercel auto-detects **Next.js** — leave all build settings at their
   defaults. No environment variables required.
4. **Deploy.** Open the URL and use the app.

> Because storage is in-memory, data won't be shared across instances and
> resets on cold start — expected for this demo.

## Android APK

A thin native Android shell (built with **Capacitor**) wraps the live web app
in a WebView, so the phone app shows exactly the deployed site. The whole UI +
API run on the server, so the app needs an internet connection.

- Config: `capacitor.config.ts` (points `server.url` at the Vercel domain)
- Native project: `android/`
- Offline fallback page: `public-shell/index.html`

### Download the APK (no tools needed)

The APK is built automatically by **GitHub Actions**:

1. Go to the repo's **Actions** tab → **Build Android APK** workflow.
2. Open the latest successful run (or click **Run workflow** to start one).
3. Download the **`gasbayar-debug-apk`** artifact — it contains
   `app-debug.apk`.
4. Copy it to an Android phone and install (enable "Install unknown apps" for
   your file manager/browser).

> This is a **debug** APK (unsigned) — fine for testing/sideloading, not for the
> Play Store.

### Build the APK locally (optional)

Requires Android SDK + JDK 21.

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

Handy scripts: `npm run cap:sync` and `npm run android:apk`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MOCK_BANK_FAILURE_RATE` | `0` | Probability (0–1) the mock bank rejects a payout |

Mock bank behaviour (`lib/mockBank.ts`):
- A destination account number ending in `000` simulates **account not found**.
- Set `MOCK_BANK_FAILURE_RATE=1` to force every payout to fail (→ auto-refund).

## Project layout

```
app/
  layout.tsx                 shell: header nav + demo banner
  page.tsx                   create-transfer form (home)
  transfers/page.tsx         transfers list
  transfers/[id]/page.tsx    transfer detail + ledger + webhook button
  accounts/page.tsx          ledger dashboard
  api/                       route handlers (health, accounts, transfers…)
components/
  StatusBadge.tsx            status pill
lib/
  types.ts                   domain types + transfer state machine
  store.ts                   in-memory store (swap for a DB in production)
  ledger.ts                  double-entry ledger
  mockBank.ts                simulated bank (name inquiry + disbursement)
  transfers.ts               transfer orchestration
  format.ts                  IDR + date formatting, status styles
scripts/
  demo.ts                    end-to-end walkthrough (terminal)
```

## Where this is intentionally simplified

A real system would add: authentication & KYC, per-user wallets, deposit
matching (amount + unique code so the webhook knows which transfer a deposit
belongs to), an outbox/queue for reliable async disbursement, retries with
backoff, timeout/expiry jobs, audit trails, and reconciliation against bank
statements. The code is structured so these can be layered in.
