import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as transfers from "./services/transfers";
import * as ledger from "./services/ledger";

/**
 * HTTP API for the transfer system.
 *
 * Endpoints:
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

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ledger_balanced: ledger.isSystemBalanced() });
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
