import { randomUUID } from "crypto";
import * as store from "./store";
import { Account, LedgerEntry } from "./types";

/**
 * Double-entry ledger.
 *
 * The golden rule: every posting is a set of entries whose amounts sum to
 * exactly zero. Money is never created or destroyed — it only moves between
 * accounts. Sign convention: positive credits (increases) an account, negative
 * debits (decreases) it.
 */

export interface PostingLine {
  account_id: string;
  amount: number;
  memo: string;
}

export function getAccount(id: string): Account | undefined {
  return store.getAccountById(id);
}

export function listAccounts(): Account[] {
  return store.allAccounts();
}

export function createAccount(name: string, type: Account["type"]): Account {
  const account: Account = {
    id: randomUUID(),
    name,
    type,
    balance: 0,
    created_at: store.nowIso(),
  };
  store.insertAccount(account);
  return account;
}

/**
 * Post a balanced set of ledger entries.
 * @throws if entries do not sum to zero, or an account is missing.
 */
export function post(
  transferId: string | null,
  lines: PostingLine[]
): LedgerEntry[] {
  if (lines.length < 2) {
    throw new Error("A posting must have at least two entries");
  }
  const sum = lines.reduce((acc, l) => acc + l.amount, 0);
  if (sum !== 0) {
    throw new Error(`Unbalanced posting: entries sum to ${sum}, expected 0`);
  }
  for (const line of lines) {
    if (!store.getAccountById(line.account_id)) {
      throw new Error(`Account not found: ${line.account_id}`);
    }
  }
  const created: LedgerEntry[] = [];
  for (const line of lines) {
    const entry: LedgerEntry = {
      id: randomUUID(),
      transfer_id: transferId,
      account_id: line.account_id,
      amount: line.amount,
      memo: line.memo,
      created_at: store.nowIso(),
    };
    store.insertLedgerEntry(entry);
    store.adjustAccountBalance(line.account_id, line.amount);
    created.push(entry);
  }
  return created;
}

export function entriesForTransfer(transferId: string): LedgerEntry[] {
  return store.ledgerEntriesFor(transferId);
}

/** Whole-ledger integrity check: every entry across all accounts sums to 0. */
export function isSystemBalanced(): boolean {
  return store.ledgerTotal() === 0;
}
