import { ensureSeeded } from "../services/transfers";
import { listAccounts } from "../services/ledger";

/**
 * Seed the core ledger accounts. In the in-memory demo build the store resets
 * on process exit, so this script is mainly illustrative — the API seeds
 * itself lazily on first request. Run with: npm run seed
 */
function main() {
  // eslint-disable-next-line no-console
  console.log("Seeding accounts...");
  ensureSeeded();
  for (const a of listAccounts()) {
    // eslint-disable-next-line no-console
    console.log(`  [${a.type}] ${a.name} — balance ${a.balance}`);
  }
}

main();
