import { initSchema, db } from "../db";
import { createAccount } from "../services/ledger";
import * as transfers from "../services/transfers";
import * as ledger from "../services/ledger";

/**
 * End-to-end demo exercising the whole flow without HTTP. Uses a throwaway
 * in-memory-ish DB file (set DB_PATH before importing db in package script).
 *
 * Run with: npm run demo
 */

function seedAccounts() {
  const banks = ["BANK_A", "BANK_B", "BANK_C"];
  for (const b of banks) {
    if (!db.prepare("SELECT 1 FROM accounts WHERE name = ?").get(`Settlement ${b}`)) {
      createAccount(`Settlement ${b}`, "SETTLEMENT");
    }
  }
  if (!db.prepare("SELECT 1 FROM accounts WHERE name = ?").get("User Funds Liability")) {
    createAccount("User Funds Liability", "LIABILITY");
  }
  if (!db.prepare("SELECT 1 FROM accounts WHERE name = ?").get("Fee Revenue")) {
    createAccount("Fee Revenue", "REVENUE");
  }
}

function printAccounts(label: string) {
  console.log(`\n--- Account balances (${label}) ---`);
  for (const a of ledger.listAccounts()) {
    console.log(`  [${a.type.padEnd(10)}] ${a.name.padEnd(24)} ${a.balance}`);
  }
  console.log(`  ledger balanced? ${ledger.isSystemBalanced()}`);
}

async function main() {
  initSchema();
  seedAccounts();

  console.log("=== Scenario 1: happy-path transfer ===");
  const t1 = await transfers.createTransfer(
    {
      amount: 150_000,
      source_bank: "BANK_A",
      dest_bank: "BANK_B",
      dest_account_number: "1234567",
      dest_account_name: "Recipient One",
    },
    "demo-key-001"
  );
  console.log(`  created transfer ${t1.id} -> status ${t1.status}`);
  console.log(`  verified recipient name: ${t1.dest_account_name}`);

  // Idempotency check: same key returns the same transfer.
  const t1Again = await transfers.createTransfer(
    {
      amount: 150_000,
      source_bank: "BANK_A",
      dest_bank: "BANK_B",
      dest_account_number: "1234567",
      dest_account_name: "Recipient One",
    },
    "demo-key-001"
  );
  console.log(
    `  idempotency: repeat returned same id? ${t1.id === t1Again.id}`
  );

  // Simulate the bank webhook: the user's deposit arrived.
  const t1Done = await transfers.handleFundsReceived(t1.id);
  console.log(`  after funds-received -> status ${t1Done.status}`);
  printAccounts("after happy path");

  console.log("\n=== Scenario 2: invalid destination account ===");
  try {
    await transfers.createTransfer({
      amount: 50_000,
      source_bank: "BANK_A",
      dest_bank: "BANK_C",
      dest_account_number: "9999000", // ends in 000 -> not found
      dest_account_name: "Ghost",
    });
  } catch (err) {
    console.log(`  rejected as expected: ${(err as Error).message}`);
  }

  console.log("\n=== Scenario 3: disbursement failure -> auto refund ===");
  process.env.MOCK_BANK_FAILURE_RATE = "1"; // force the destination bank to reject
  const t3 = await transfers.createTransfer({
    amount: 75_000,
    source_bank: "BANK_B",
    dest_bank: "BANK_C",
    dest_account_number: "5556677",
    dest_account_name: "Recipient Three",
  });
  const t3Done = await transfers.handleFundsReceived(t3.id);
  console.log(`  transfer ${t3.id} final status -> ${t3Done.status}`);
  if (t3Done.failure_reason) {
    console.log(`  failure_reason: ${t3Done.failure_reason}`);
  }
  process.env.MOCK_BANK_FAILURE_RATE = "0"; // reset
  printAccounts("after failure/refund scenario");

  console.log("\n=== Ledger entries for transfer 1 ===");
  for (const e of ledger.entriesForTransfer(t1.id)) {
    console.log(
      `  ${e.amount >= 0 ? "+" : ""}${e.amount}  ${e.memo}`
    );
  }

  console.log("\nDemo complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
