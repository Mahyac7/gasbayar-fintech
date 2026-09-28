/**
 * In-memory data store (Vercel demo mode).
 *
 * ⚠️ NOT PERSISTENT. On Vercel, serverless functions are ephemeral: state is
 * lost whenever the instance is recycled, and different requests may hit
 * different instances. This store exists ONLY to demo the API surface. For a
 * real system, back these collections with a database (Postgres/Neon).
 *
 * This module intentionally mirrors the minimal query surface that the
 * services need, replacing the SQLite layer for the demo build.
 */

import { Account, LedgerEntry, Transfer } from "./types";

interface Store {
  accounts: Map<string, Account>;
  transfers: Map<string, Transfer>;
  ledgerEntries: LedgerEntry[];
  idempotencyKeys: Map<string, string>; // key -> transferId
}

// A single module-level instance. Reset on cold start.
const store: Store = {
  accounts: new Map(),
  transfers: new Map(),
  ledgerEntries: [],
  idempotencyKeys: new Map(),
};

export function nowIso(): string {
  return new Date().toISOString();
}

/** Whether the core accounts have been seeded in this instance. */
export function isSeeded(): boolean {
  return store.accounts.size > 0;
}

// ---- Accounts ----

export function insertAccount(a: Account): void {
  store.accounts.set(a.id, a);
}

export function getAccountById(id: string): Account | undefined {
  return store.accounts.get(id);
}

export function getAccountByName(name: string): Account | undefined {
  for (const a of store.accounts.values()) {
    if (a.name === name) return a;
  }
  return undefined;
}

export function getSettlementAccountByName(name: string): Account | undefined {
  const a = getAccountByName(name);
  return a && a.type === "SETTLEMENT" ? a : undefined;
}

export function allAccounts(): Account[] {
  return [...store.accounts.values()].sort((x, y) =>
    x.name.localeCompare(y.name)
  );
}

export function adjustAccountBalance(id: string, delta: number): void {
  const a = store.accounts.get(id);
  if (!a) throw new Error(`Account not found: ${id}`);
  a.balance += delta;
}

// ---- Transfers ----

export function insertTransfer(t: Transfer): void {
  store.transfers.set(t.id, t);
}

export function getTransferById(id: string): Transfer | undefined {
  return store.transfers.get(id);
}

export function updateTransfer(t: Transfer): void {
  store.transfers.set(t.id, t);
}

export function allTransfers(): Transfer[] {
  return [...store.transfers.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

// ---- Ledger ----

export function insertLedgerEntry(e: LedgerEntry): void {
  store.ledgerEntries.push(e);
}

export function ledgerEntriesFor(transferId: string): LedgerEntry[] {
  return store.ledgerEntries
    .filter((e) => e.transfer_id === transferId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ledgerTotal(): number {
  return store.ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
}

// ---- Idempotency ----

export function getIdempotency(key: string): string | undefined {
  return store.idempotencyKeys.get(key);
}

export function setIdempotency(key: string, transferId: string): void {
  store.idempotencyKeys.set(key, transferId);
}
