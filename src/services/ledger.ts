import { randomUUID } from "crypto";
import { db, nowIso } from "../db";
import { Account, LedgerEntry } from "../types";

/**
 * Double-entry ledger.
 *
 * The golden rule: every posting is a set of entries whose amounts sum to
 * exactly zero. Money is never created or destroyed — it only moves between
 * accounts. We enforce that invariant in `post()` and refuse to write an
 * unbalanced set of entries.
 *
 * Sign convention: a positive amount credits (increases) an account, a
 * negative amount debits (decreases) it. The cached `accounts.balance` column
 * is updated in the same transaction so reads are fast, but the true balance
 * is always the sum of ledger entries for that account.
 */

export interface PostingLine {
  account_id: string;
  amount: number; // positive = credit, negative = debit
  memo: string;
}

export function getAccount(id: string): Account | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
    | Account
    | undefined;
}

export function listAccounts(): Account[] {
  return db.prepare("SELECT * FROM accounts ORDER BY name").all() as Account[];
}

export function createAccount(
  name: string,
  type: Account["type"]
): Account {
  const account: Account = {
    id: randomUUID(),
    name,
    type,
    balance: 0,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO accounts (id, name, type, balance, created_at)
     VALUES (@id, @name, @type, @balance, @created_at)`
  ).run(account);
  return account;
}

/**
 * Post a balanced set of ledger entries atomically.
 *
 * @throws if the entries do not sum to zero (unbalanced posting), or if any
 *         referenced account does not exist.
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
    throw new Error(
      `Unbalanced posting: entries sum to ${sum}, expected 0`
    );
  }

  const insertEntry = db.prepare(
    `INSERT INTO ledger_entries (id, transfer_id, account_id, amount, memo, created_at)
     VALUES (@id, @transfer_id, @account_id, @amount, @memo, @created_at)`
  );
  const bumpBalance = db.prepare(
    `UPDATE accounts SET balance = balance + @delta WHERE id = @account_id`
  );

  const txn = db.transaction((): LedgerEntry[] => {
    const created: LedgerEntry[] = [];
    for (const line of lines) {
      const account = getAccount(line.account_id);
      if (!account) {
        throw new Error(`Account not found: ${line.account_id}`);
      }
      const entry: LedgerEntry = {
        id: randomUUID(),
        transfer_id: transferId,
        account_id: line.account_id,
        amount: line.amount,
        memo: line.memo,
        created_at: nowIso(),
      };
      insertEntry.run(entry);
      bumpBalance.run({ delta: line.amount, account_id: line.account_id });
      created.push(entry);
    }
    return created;
  });

  return txn();
}

export function entriesForTransfer(transferId: string): LedgerEntry[] {
  return db
    .prepare(
      "SELECT * FROM ledger_entries WHERE transfer_id = ? ORDER BY created_at"
    )
    .all(transferId) as LedgerEntry[];
}

/**
 * Verify the whole ledger is balanced: the sum of every entry across all
 * accounts must be zero. Useful as a reconciliation / integrity check.
 */
export function isSystemBalanced(): boolean {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries")
    .get() as { total: number };
  return row.total === 0;
}
