import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as transfers from "./services/transfers";
import * as ledger from "./services/ledger";

/**
 * HTTP API for the transfer system.
 *
 * Endpoints:
 *   GET  /                          landing page (HTML) with usage + demo note
 *   POST /transfers                 create a transfer (Idempotency-Key header)
 *   GET  /transfers                 list transfers
 *   GET  /transfers/:id             get one transfer + its ledger entries
 *   POST /transfers/:id/funds-received   bank webhook: user's deposit arrived
 *   GET  /accounts                  list ledger accounts + balances
 *   GET  /health                    health + ledger-balanced check
 */

const createTransferSchema = z.object({
  amount: z.number().int().positive(),
  source_bank: z.string().min(1),
  dest_bank: z.string().min(1),
  dest_account_number: z.string().min(1),
  dest_account_name: z.string().min(1),
});

/** Wrap an async handler so rejected promises reach the error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gasbayar — Interbank Transfer MVP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.55; color: #1a1a1a; }
    code, pre { background: #f4f4f5; border-radius: 6px; }
    code { padding: 2px 6px; }
    pre { padding: 14px; overflow-x: auto; }
    .note { background: #fff7ed; border: 1px solid #fdba74; padding: 12px 16px; border-radius: 8px; }
    h1 { margin-bottom: 4px; }
    a { color: #2563eb; }
    ul { padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Gasbayar — Interbank Transfer MVP</h1>
  <p>A Flip-style money-transfer demo: double-entry ledger, idempotency, a transfer state machine, and a mock bank service.</p>

  <div class="note">
    <strong>⚠️ Demo mode:</strong> this deployment uses an <strong>in-memory store</strong>.
    Data is <strong>not persistent</strong> and resets whenever the serverless instance recycles.
    For a real system, back it with a database (Postgres/Neon).
  </div>

  <h2>Endpoints</h2>
  <ul>
    <li><code>GET /health</code> — health + ledger-balanced check</li>
    <li><code>GET /accounts</code> — ledger accounts and balances</li>
    <li><code>POST /transfers</code> — create a transfer (header <code>Idempotency-Key</code>)</li>
    <li><code>GET /transfers</code> — list transfers</li>
    <li><code>GET /transfers/:id</code> — one transfer + its ledger entries</li>
    <li><code>POST /transfers/:id/funds-received</code> — bank webhook: deposit arrived</li>
  </ul>

  <h2>Try it</h2>
  <pre>curl -X POST /transfers \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: demo-1' \\
  -d '{"amount":150000,"source_bank":"BANK_A","dest_bank":"BANK_B","dest_account_number":"1234567","dest_account_name":"Alice"}'

# then trigger the payout with the returned id:
curl -X POST /transfers/&lt;id&gt;/funds-received</pre>

  <p>Source: <a href="https://github.com/Mahyac7/gasbayar-fintech">github.com/Mahyac7/gasbayar-fintech</a></p>
</body>
</html>`;

export function createApp() {
  const app = express();
  app.use(express.json());

  // Lazily seed the in-memory ledger accounts on every request (no-op once
  // seeded within an instance). Needed because serverless cold starts wipe
  // module state.
  app.use((_req, _res, next) => {
    transfers.ensureSeeded();
    next();
  });

  app.get("/", (_req, res) => {
    res.type("html").send(LANDING_HTML);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: "in-memory-demo", ledger_balanced: ledger.isSystemBalanced() });
  });

  app.get("/accounts", (_req, res) => {
    res.json(ledger.listAccounts());
  });

  app.post(
    "/transfers",
    asyncHandler(async (req, res) => {
      const parsed = createTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const idempotencyKey = req.header("Idempotency-Key") || undefined;
      const transfer = await transfers.createTransfer(parsed.data, idempotencyKey);
      res.status(201).json(transfer);
    })
  );

  app.get("/transfers", (_req, res) => {
    res.json(transfers.listTransfers());
  });

  app.get("/transfers/:id", (req, res) => {
    const transfer = transfers.getTransfer(req.params.id);
    if (!transfer) return res.status(404).json({ error: "not_found" });
    res.json({
      ...transfer,
      ledger_entries: ledger.entriesForTransfer(transfer.id),
    });
  });

  // Bank webhook: the user's inbound deposit has landed in our settlement
  // account. This triggers the payout to the destination bank.
  app.post(
    "/transfers/:id/funds-received",
    asyncHandler(async (req, res) => {
      const existing = transfers.getTransfer(req.params.id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      const transfer = await transfers.handleFundsReceived(req.params.id);
      res.json(transfer);
    })
  );

  // Central error handler — maps domain errors to 400, everything else to 500.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(400).json({ error: err.message });
  });

  return app;
}
