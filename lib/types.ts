/**
 * Core domain types for the transfer system.
 *
 * Money note: we store all amounts as INTEGER minor units (e.g. rupiah, not
 * thousands of rupiah). Never use floats for money — floating point rounding
 * errors are unacceptable in a ledger.
 */

/**
 * Transfer lifecycle state machine.
 *
 *   CREATED
 *     │  user submits a transfer; we tell them which Flip account to fund
 *     ▼
 *   AWAITING_FUNDS
 *     │  bank confirms the user's inbound deposit arrived (webhook)
 *     ▼
 *   FUNDS_RECEIVED
 *     │  we begin the payout to the destination bank
 *     ▼
 *   DISBURSING
 *     │  destination bank confirms credit
 *     ▼
 *   COMPLETED
 *
 * Failure / terminal branches:
 *   AWAITING_FUNDS ─(timeout)────────▶ EXPIRED
 *   DISBURSING ─(payout rejected)────▶ FAILED ──(auto)──▶ REFUNDED
 */
export type TransferStatus =
  | "CREATED"
  | "AWAITING_FUNDS"
  | "FUNDS_RECEIVED"
  | "DISBURSING"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "EXPIRED";

/** Allowed state transitions. Any transition not listed here is rejected. */
export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  CREATED: ["AWAITING_FUNDS", "EXPIRED"],
  AWAITING_FUNDS: ["FUNDS_RECEIVED", "EXPIRED"],
  FUNDS_RECEIVED: ["DISBURSING"],
  DISBURSING: ["COMPLETED", "FAILED"],
  FAILED: ["REFUNDED"],
  COMPLETED: [],
  REFUNDED: [],
  EXPIRED: [],
};

export interface Account {
  id: string;
  name: string;
  type: "SETTLEMENT" | "LIABILITY" | "REVENUE";
  balance: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  transfer_id: string | null;
  account_id: string;
  /** Positive = credit into account, negative = debit out of account. */
  amount: number;
  memo: string;
  created_at: string;
}

export interface Transfer {
  id: string;
  status: TransferStatus;
  amount: number;
  fee: number;
  source_bank: string;
  settlement_account_id: string;
  dest_bank: string;
  dest_account_number: string;
  dest_account_name: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferInput {
  amount: number;
  source_bank: string;
  dest_bank: string;
  dest_account_number: string;
  dest_account_name: string;
}
