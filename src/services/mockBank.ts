/**
 * Mock bank service.
 *
 * In production this layer would talk to a real bank switching network or a
 * payment aggregator (e.g. via ISO 8583, an aggregator REST API, or the bank's
 * own host-to-host integration). Here we simulate the two operations we need:
 *
 *   1. Inbound funds detection — in reality the bank notifies us via a webhook
 *      when a user's deposit lands in our settlement account. We simulate that
 *      the deposit "arrives" and expose a helper the demo/webhook can call.
 *
 *   2. Outbound disbursement (payout) — we ask the bank to credit the
 *      destination account. Real networks are asynchronous and can reject; we
 *      simulate latency and a configurable failure rate.
 */

import { randomUUID } from "crypto";

export interface DisbursementResult {
  ok: boolean;
  /** Bank-side reference number for reconciliation. */
  reference: string;
  /** Present when ok === false. */
  reason?: string;
}

export interface AccountInquiryResult {
  ok: boolean;
  account_name?: string;
  reason?: string;
}

/** Probability (0..1) that a disbursement is rejected by the destination bank.
 *  Read per-call so tests/demos can toggle MOCK_BANK_FAILURE_RATE at runtime. */
function failureRate(): number {
  return Number(process.env.MOCK_BANK_FAILURE_RATE ?? "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Name inquiry: verify a destination account exists and return the registered
 * account holder name. Real banks expose this so the sender can confirm the
 * recipient before committing. Here we accept any numeric-looking account and
 * echo a deterministic name unless the number ends in "000" (simulated
 * closed/invalid account).
 */
export async function inquireAccount(
  bank: string,
  accountNumber: string
): Promise<AccountInquiryResult> {
  await sleep(50);
  if (!/^\d{6,}$/.test(accountNumber)) {
    return { ok: false, reason: "INVALID_ACCOUNT_FORMAT" };
  }
  if (accountNumber.endsWith("000")) {
    return { ok: false, reason: "ACCOUNT_NOT_FOUND" };
  }
  return { ok: true, account_name: `Holder ${bank}-${accountNumber.slice(-4)}` };
}

/**
 * Request the destination bank to credit `amount` (minor units) to the given
 * account. Returns asynchronously with a success/failure result.
 */
export async function disburse(
  bank: string,
  accountNumber: string,
  amount: number
): Promise<DisbursementResult> {
  // Simulate network latency to the bank.
  await sleep(100);

  const reference = `${bank}-${randomUUID().slice(0, 8).toUpperCase()}`;

  if (Math.random() < failureRate()) {
    return { ok: false, reference, reason: "DESTINATION_BANK_REJECTED" };
  }
  return { ok: true, reference };
}
