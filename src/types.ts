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
  /** Human label, e.g. "Flip Settlement - BANK_A" or "User Wallet". */
  name: string;
  /**
   * Account role in the ledger:
   *  - SETTLEMENT: a Flip-owned bank account where user deposits land
   *  - LIABILITY:  funds we owe (in-flight transfers held on behalf of users)
   *  - REVENUE:    fees we earn
   */
  type: "SETTLEMENT" | "LIABILITY" | "REVENUE";
  /** Cached balance in minor units. Source of truth is the ledger sum. */
  balance: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  transfer_id: string | null;
  account_id: string;
  /** Positive = credit into account, negative = debit out of account. */
  amount: number;
  /** Free-text description of what this entry represents. */
  memo: string;
  created_at: string;
}

export interface Transfer {
  id: string;
  status: TransferStatus;
  /** Amount the recipient should receive, in minor units. */
  amount: number;
  /** Flip's fee for this transfer, in minor units (0 for the free tier). */
  fee: number;
  /** Source bank code the user deposits from, e.g. "BANK_A". */
  source_bank: string;
  /** The Flip settlement account the user must deposit into. */
  settlement_account_id: string;
  /** Destination bank code, e.g. "BANK_B". */
  dest_bank: string;
  /** Destination account number at the destination bank. */
  dest_account_number: string;
  /** Destination account holder name (for verification/receipt). */
  dest_account_name: string;
  /** Reason recorded when a transfer fails or expires. */
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
