import { initSchema, db } from "../db";
import { createAccount, listAccounts } from "../services/ledger";

/**
 * Seed the core ledger accounts required by the transfer service:
 *   - one SETTLEMENT account per supported source bank
 *   - a single LIABILITY account for in-flight user funds
 *   - a single REVENUE account for fees
 *
 * Safe to run multiple times: existing accounts (by name) are left untouched.
 */
const SOURCE_BANKS = ["BANK_A", "BANK_B", "BANK_C"];

function ensureAccount(name: string, type: "SETTLEMENT" | "LIABILITY" | "REVENUE") {
  const exists = db.prepare("SELECT 1 FROM accounts WHERE name = ?").get(name);
  if (!exists) {
    createAccount(name, type);
    // eslint-disable-next-line no-console
    console.log(`  created ${type} account: ${name}`);
  }
}

function main() {
  initSchema();
  // eslint-disable-next-line no-console
  console.log("Seeding accounts...");
  for (const bank of SOURCE_BANKS) {
    ensureAccount(`Settlement ${bank}`, "SETTLEMENT");
  }
  ensureAccount("User Funds Liability", "LIABILITY");
  ensureAccount("Fee Revenue", "REVENUE");

  // eslint-disable-next-line no-console
  console.log("\nAccounts:");
  for (const a of listAccounts()) {
    // eslint-disable-next-line no-console
    console.log(`  [${a.type}] ${a.name} — balance ${a.balance}`);
  }
}

main();
