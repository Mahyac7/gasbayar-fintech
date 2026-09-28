/**
 * Mock bank service.
 *
 * In production this layer would talk to a real bank switching network or a
 * payment aggregator (e.g. via ISO 8583, an aggregator REST API, or the bank's
 * own host-to-host integration). Here we simulate the two operations we need:
 *   1. Name inquiry — verify a destination account exists.
 *   2. Disbursement — ask the destination bank to credit the recipient.
 */

import { randomUUID } from "crypto";

export interface DisbursementResult {
  ok: boolean;
  reference: string;
  reason?: string;
}

export interface AccountInquiryResult {
  ok: boolean;
  account_name?: string;
  reason?: string;
}

/** Probability (0..1) that a disbursement is rejected. Read per-call so it can
 *  be toggled at runtime via MOCK_BANK_FAILURE_RATE. */
function failureRate(): number {
  return Number(process.env.MOCK_BANK_FAILURE_RATE ?? "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify a destination account exists and return the registered holder name.
 * Accepts any 6+ digit account and echoes a deterministic name, except numbers
 * ending in "000" which simulate a closed/invalid account.
 */
export async function inquireAccount(
  bank: string,
  accountNumber: string
): Promise<AccountInquiryResult> {
  await sleep(30);
  if (!/^\d{6,}$/.test(accountNumber)) {
    return { ok: false, reason: "INVALID_ACCOUNT_FORMAT" };
  }
  if (accountNumber.endsWith("000")) {
    return { ok: false, reason: "ACCOUNT_NOT_FOUND" };
  }
  return { ok: true, account_name: `Holder ${bank}-${accountNumber.slice(-4)}` };
}

/** Ask the destination bank to credit `amount` (minor units) to the account. */
export async function disburse(
  bank: string,
  _accountNumber: string,
  _amount: number
): Promise<DisbursementResult> {
  await sleep(60);
  const reference = `${bank}-${randomUUID().slice(0, 8).toUpperCase()}`;
  if (Math.random() < failureRate()) {
    return { ok: false, reference, reason: "DESTINATION_BANK_REJECTED" };
  }
  return { ok: true, reference };
}
