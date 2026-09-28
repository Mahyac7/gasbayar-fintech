import { randomUUID } from "crypto";
import * as store from "./store";
import {
  CreateTransferInput,
  Transfer,
  TransferStatus,
  TRANSFER_TRANSITIONS,
} from "./types";
import * as ledger from "./ledger";
import * as bank from "./mockBank";

/**
 * Transfer orchestration service — models the "Flip" flow:
 *   1. createTransfer      — validate destination, record transfer, → AWAITING_FUNDS
 *   2. handleFundsReceived — deposit webhook: credit settlement + liability, → FUNDS_RECEIVED, then disburse
 *   3. disburse            — pay recipient; success clears liability + fee revenue (COMPLETED),
 *                            failure → FAILED → auto REFUNDED.
 */

const LIABILITY_ACCOUNT_NAME = "User Funds Liability";
const REVENUE_ACCOUNT_NAME = "Fee Revenue";
export const SOURCE_BANKS = ["BANK_A", "BANK_B", "BANK_C"];

/** Free tier: no fee (like Flip's free transfers). */
function computeFee(_amount: number): number {
  return 0;
}

export function getTransfer(id: string): Transfer | undefined {
  return store.getTransferById(id);
}

function requireAccountByName(name: string) {
  const a = store.getAccountByName(name);
  if (!a) throw new Error(`Required account "${name}" not found — not seeded`);
  return a;
}

function settlementAccountForBank(sourceBank: string) {
  const a = store.getSettlementAccountByName(`Settlement ${sourceBank}`);
  if (!a) {
    throw new Error(
      `No settlement account configured for source bank "${sourceBank}"`
    );
  }
  return a;
}

/** Transition enforcing the state machine. @throws on illegal transitions. */
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

/** Create a transfer (idempotent via idempotencyKey). */
export async function createTransfer(
  input: CreateTransferInput,
  idempotencyKey?: string
): Promise<Transfer> {
  ensureSeeded();

  if (idempotencyKey) {
    const existingId = store.getIdempotency(idempotencyKey);
    if (existingId) return getTransfer(existingId)!;
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("amount must be a positive integer (minor units)");
  }

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
  if (idempotencyKey) store.setIdempotency(idempotencyKey, transfer.id);

  return transition(transfer.id, "AWAITING_FUNDS");
}

/** Deposit webhook: credit settlement + liability, then disburse. Idempotent. */
export async function handleFundsReceived(
  transferId: string
): Promise<Transfer> {
  const transfer = getTransfer(transferId);
  if (!transfer) throw new Error(`Transfer not found: ${transferId}`);
  if (transfer.status !== "AWAITING_FUNDS") return transfer;

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

/** Perform the outbound payout and settle the ledger. */
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

/** Refund a failed transfer: reverse liability + settlement postings. */
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

/** Lazily seed the core ledger accounts (in-memory store resets on cold start). */
export function ensureSeeded(): void {
  if (store.isSeeded()) return;
  for (const b of SOURCE_BANKS) {
    ledger.createAccount(`Settlement ${b}`, "SETTLEMENT");
  }
  ledger.createAccount(LIABILITY_ACCOUNT_NAME, "LIABILITY");
  ledger.createAccount(REVENUE_ACCOUNT_NAME, "REVENUE");
}
