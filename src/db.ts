import Database from "better-sqlite3";
import path from "path";

/**
 * SQLite connection + schema. We use WAL mode and enable foreign keys.
 *
 * The database file path can be overridden with DB_PATH (used by tests/demo
 * to point at a throwaway file).
 */
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "flip.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL CHECK (type IN ('SETTLEMENT','LIABILITY','REVENUE')),
      balance     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id                    TEXT PRIMARY KEY,
      status                TEXT NOT NULL,
      amount                INTEGER NOT NULL CHECK (amount > 0),
      fee                   INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
      source_bank           TEXT NOT NULL,
      settlement_account_id TEXT NOT NULL REFERENCES accounts(id),
      dest_bank             TEXT NOT NULL,
      dest_account_number   TEXT NOT NULL,
      dest_account_name     TEXT NOT NULL,
      failure_reason        TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id          TEXT PRIMARY KEY,
      transfer_id TEXT REFERENCES transfers(id),
      account_id  TEXT NOT NULL REFERENCES accounts(id),
      amount      INTEGER NOT NULL,
      memo        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    -- Idempotency keys map a client-supplied key to the transfer it created,
    -- so retries of the same request return the same transfer instead of
    -- creating duplicates.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key         TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL REFERENCES transfers(id),
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_transfer ON ledger_entries(transfer_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_account  ON ledger_entries(account_id);
  `);
}

export function nowIso(): string {
  return new Date().toISOString();
}
