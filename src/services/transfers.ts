import { randomUUID } from "crypto";
import { db, nowIso } from "../db";
import {
  CreateTransferInput,
  Transfer,
  TransferStatus,
  TRANSFER_TRANSITIONS,
} from "../types";
import * as ledger from "./ledger";
import * as bank from "./mockBank";

/**
 * Transfer orchestration service.
 *
 * This models the "Flip" flow:
 *
 *   1. createTransfer      — user requests a transfer; we validate the
 *                            destination, pick a settlement account for the
 *                            source bank, record the transfer, and move it to
 *                            AWAITING_FUNDS. Idempotent via an idempotency key.
 *
 *   2. handleFundsReceived — the bank webhook tells us the user's deposit
 *                            landed. We credit our settlement account and our
 *                            liability account (we now owe this money to the
 *                            recipient), then kick off disbursement.
 *
 *   3. disburse            — we ask the destination bank to credit the
 *                            recipient. On success the liability is cleared and
 *                            fee revenue recognised (COMPLETED). On failure the
 *                            transfer is FAILED and then auto-REFUNDED, which
 *                            reverses the liability back to the user.
 */

// A single shared liability account holding all in-flight user funds, and a
// single revenue account for fees. These are created by the seed script.
const LIABILITY_ACCOUNT_NAME = "User Funds Liability";
const REVENUE_ACCOUNT_NAME = "Fee Revenue";

/** Fee policy. The free tier charges nothing (like Flip's free transfers). */
function computeFee(_amount: number): number {
  return 0;
}

function rowToTransfer(row: any): Transfer {
  return row as Transfer;
}

export function getTransfer(id: string): Transfer | undefined {
  const row = db.prepare("SELECT * FROM transfers WHERE id = ?").get(id);
  return row ? rowToTransfer(row) : undefined;
}

function requireAccountByName(name: string) {
  const row = db
    .prepare("SELECT * FROM accounts WHERE name = ?")
    .get(name) as { id: string } | undefined;
  if (!row) {
    throw new Error(
      `Required account "${name}" not found — run the seed script first`
    );
  }
  return row;
}

/** Pick the Flip settlement account for a given source bank. */
function settlementAccountForBank(sourceBank: string) {
  const name = `Settlement ${sourceBank}`;
  const row = db
    .prepare("SELECT * FROM accounts WHERE name = ? AND type = 'SETTLEMENT'")
    .get(name) as { id: string } | undefined;
  if (!row) {
    throw new Error(
      `No settlement account configured for source bank "${sourceBank}"`
    );
  }
  return row;
}

/**
 * Transition a transfer to a new status, enforcing the state machine. Throws
 * if the transition is not allowed. Persists updated_at and optional
 * failure_reason.
 */
export function transition(
  id: string,
  to: TransferStatus,
  failureReason?: string
): Transfer {
  const transfer = getTransfer(id);
  if (!transfer) throw new Error(`Transfer not found: ${id}`);

  const allowed = TRANSFER_TRANSITIONS[transfer.status];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal transition ${transfer.status} -> ${to} for transfer ${id}`
    );
  }

  db.prepare(
    `UPDATE transfers
       SET status = @status,
           failure_reason = @failure_reason,
           updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id,
    status: to,
    failure_reason: failureReason ?? transfer.failure_reason,
    updated_at: nowIso(),
  });

  return getTransfer(id)!;
}

/**
 * Create a transfer. Validates the destination account via a name inquiry and
 * records the transfer as AWAITING_FUNDS. Idempotent: passing the same
 * idempotencyKey returns the already-created transfer.
 */
export async function createTransfer(
  input: CreateTransferInput,
  idempotencyKey?: string
): Promise<Transfer> {
  // Idempotency: if we've seen this key, return the existing transfer.
  if (idempotencyKey) {
    const existing = db
      .prepare("SELECT transfer_id FROM idempotency_keys WHERE key = ?")
      .get(idempotencyKey) as { transfer_id: string } | undefined;
    if (existing) {
      return getTransfer(existing.transfer_id)!;
    }
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("amount must be a positive integer (minor units)");
  }

  // Verify the destination account exists at the destination bank.
  const inquiry = await bank.inquireAccount(
    input.dest_bank,
    input.dest_account_number
  );
  if (!inquiry.ok) {
    throw new Error(`Destination account rejected: ${inquiry.reason}`);
  }

  const settlement = settlementAccountForBank(input.source_bank);
  const fee = computeFee(input.amount);
  const now = nowIso();

  const transfer: Transfer = {
    id: randomUUID(),
    status: "CREATED",
    amount: input.amount,
    fee,
    source_bank: input.source_bank,
    settlement_account_id: settlement.id,
    dest_bank: input.dest_bank,
    dest_account_number: input.dest_account_number,
    dest_account_name: inquiry.account_name ?? input.dest_account_name,
    failure_reason: null,
    created_at: now,
    updated_at: now,
  };

  const writeTransfer = db.transaction(() => {
    db.prepare(
      `INSERT INTO transfers
        (id, status, amount, fee, source_bank, settlement_account_id,
         dest_bank, dest_account_number, dest_account_name, failure_reason,
         created_at, updated_at)
       VALUES
        (@id, @status, @amount, @fee, @source_bank, @settlement_account_id,
         @dest_bank, @dest_account_number, @dest_account_name, @failure_reason,
         @created_at, @updated_at)`
    ).run(transfer);

    if (idempotencyKey) {
      db.prepare(
        `INSERT INTO idempotency_keys (key, transfer_id, created_at)
         VALUES (?, ?, ?)`
      ).run(idempotencyKey, transfer.id, now);
    }
  });
  writeTransfer();

  // Move to AWAITING_FUNDS — we now wait for the user's deposit.
  return transition(transfer.id, "AWAITING_FUNDS");
}

/**
 * Handle the bank's "deposit received" webhook. Credits the settlement account
 * (real cash arrived) and credits the liability account (we now owe the
 * recipient). Then triggers disbursement.
 *
 * Idempotent: if the transfer already progressed past AWAITING_FUNDS, this is
 * a no-op returning the current transfer.
 */
export async function handleFundsReceived(transferId: string): Promise<Transfer> {
  const transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);

  // Idempotency guard for repeated webhooks.
  if (transfer.status !== "AWAITING_FUNDS") {
    return transfer;
  }

  const liability = requireAccountByName(LIABILITY_ACCOUNT_NAME);
  const totalReceived = transfer.amount + transfer.fee;

  // Cash lands in our settlement account (+), and we record a liability we owe
  // to the recipient (+). Debit/credit must net to zero.
  ledger.post(transfer.id, [
    {
      account_id: transfer.settlement_account_id,
      amount: totalReceived,
      memo: "Inbound deposit received",
    },
    {
      account_id: liability.id,
      amount: -totalReceived,
      memo: "Liability accrued for pending payout",
    },
  ]);

  transition(transfer.id, "FUNDS_RECEIVED");
  return disburse(transfer.id);
}

/**
 * Perform the outbound payout to the destination bank and settle the ledger.
 */
export async function disburse(transferId: string): Promise<Transfer> {
  let transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);
  if (transfer.status !== "FUNDS_RECEIVED") {
    throw new Error(
      `Cannot disburse transfer in status ${transfer.status}`
    );
  }

  transfer = transition(transfer.id, "DISBURSING");

  const result = await bank.disburse(
    transfer.dest_bank,
    transfer.dest_account_number,
    transfer.amount
  );

  const liability = requireAccountByName(LIABILITY_ACCOUNT_NAME);
  const revenue = requireAccountByName(REVENUE_ACCOUNT_NAME);

  if (!result.ok) {
    // Payout failed → mark FAILED then auto-refund by reversing the liability
    // and returning the cash out of the settlement account.
    transition(transfer.id, "FAILED", result.reason ?? "DISBURSEMENT_FAILED");
    return refund(transfer.id);
  }

  const totalReceived = transfer.amount + transfer.fee;

  // Success: money leaves the settlement account to the recipient, the
  // liability is cleared, and the fee is recognised as revenue.
  ledger.post(transfer.id, [
    {
      account_id: transfer.settlement_account_id,
      amount: -totalReceived,
      memo: `Payout to ${transfer.dest_bank}/${transfer.dest_account_number} (ref ${result.reference})`,
    },
    {
      account_id: liability.id,
      amount: totalReceived,
      memo: "Liability cleared on successful payout",
    },
    ...(transfer.fee > 0
      ? [
          {
            account_id: liability.id,
            amount: -transfer.fee,
            memo: "Fee moved from liability",
          },
          {
            account_id: revenue.id,
            amount: transfer.fee,
            memo: "Fee revenue recognised",
          },
        ]
      : []),
  ]);

  return transition(transfer.id, "COMPLETED");
}

/**
 * Refund a failed transfer: reverse the liability and settlement postings so
 * the money is returned to the user. In a real system this would trigger a
 * payout back to the user's source account.
 */
export function refund(transferId: string): Transfer {
  const transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);
  if (transfer.status !== "FAILED") {
    throw new Error(`Only FAILED transfers can be refunded (got ${transfer.status})`);
  }

  const liability = requireAccountByName(LIABILITY_ACCOUNT_NAME);
  const totalReceived = transfer.amount + transfer.fee;

  // Reverse: cash leaves settlement (refunded to user), liability cleared.
  ledger.post(transfer.id, [
    {
      account_id: transfer.settlement_account_id,
      amount: -totalReceived,
      memo: "Refund returned to user",
    },
    {
      account_id: liability.id,
      amount: totalReceived,
      memo: "Liability cleared on refund",
    },
  ]);

  return transition(transfer.id, "REFUNDED");
}

export function listTransfers(): Transfer[] {
  return db
    .prepare("SELECT * FROM transfers ORDER BY created_at DESC")
    .all() as Transfer[];
}
