import { randomUUID } from "crypto";
import * as store from "../store";
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
 *
 * (Demo build: backed by an in-memory store — see src/store.ts.)
 */

const LIABILITY_ACCOUNT_NAME = "User Funds Liability";
const REVENUE_ACCOUNT_NAME = "Fee Revenue";

/** Fee policy. The free tier charges nothing (like Flip's free transfers). */
function computeFee(_amount: number): number {
  return 0;
}

export function getTransfer(id: string): Transfer | undefined {
  return store.getTransferById(id);
}

function requireAccountByName(name: string) {
  const a = store.getAccountByName(name);
  if (!a) {
    throw new Error(
      `Required account "${name}" not found — accounts not seeded`
    );
  }
  return a;
}

/** Pick the Flip settlement account for a given source bank. */
function settlementAccountForBank(sourceBank: string) {
  const name = `Settlement ${sourceBank}`;
  const a = store.getSettlementAccountByName(name);
  if (!a) {
    throw new Error(
      `No settlement account configured for source bank "${sourceBank}"`
    );
  }
  return a;
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

  const updated: Transfer = {
    ...transfer,
    status: to,
    failure_reason: failureReason ?? transfer.failure_reason,
    updated_at: store.nowIso(),
  };
  store.updateTransfer(updated);
  return updated;
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
  if (idempotencyKey) {
    const existingId = store.getIdempotency(idempotencyKey);
    if (existingId) {
      return getTransfer(existingId)!;
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
  const now = store.nowIso();

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

  store.insertTransfer(transfer);
  if (idempotencyKey) {
    store.setIdempotency(idempotencyKey, transfer.id);
  }

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
export async function handleFundsReceived(
  transferId: string
): Promise<Transfer> {
  const transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);

  if (transfer.status !== "AWAITING_FUNDS") {
    return transfer;
  }

  const liability = requireAccountByName(LIABILITY_ACCOUNT_NAME);
  const totalReceived = transfer.amount + transfer.fee;

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
    throw new Error(`Cannot disburse transfer in status ${transfer.status}`);
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
    transition(transfer.id, "FAILED", result.reason ?? "DISBURSEMENT_FAILED");
    return refund(transfer.id);
  }

  const totalReceived = transfer.amount + transfer.fee;

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
 * the money is returned to the user.
 */
export function refund(transferId: string): Transfer {
  const transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);
  if (transfer.status !== "FAILED") {
    throw new Error(
      `Only FAILED transfers can be refunded (got ${transfer.status})`
    );
  }

  const liability = requireAccountByName(LIABILITY_ACCOUNT_NAME);
  const totalReceived = transfer.amount + transfer.fee;

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
  return store.allTransfers();
}

/**
 * Ensure the core ledger accounts exist in this instance. Because the store is
 * in-memory and resets on cold start, we seed lazily on first use.
 */
export function ensureSeeded(): void {
  if (store.isSeeded()) return;
  for (const b of ["BANK_A", "BANK_B", "BANK_C"]) {
    ledger.createAccount(`Settlement ${b}`, "SETTLEMENT");
  }
  ledger.createAccount(LIABILITY_ACCOUNT_NAME, "LIABILITY");
  ledger.createAccount(REVENUE_ACCOUNT_NAME, "REVENUE");
}
