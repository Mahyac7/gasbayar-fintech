import { NextResponse } from "next/server";
import * as ledger from "@/lib/ledger";
import { ensureSeeded } from "@/lib/transfers";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded();
  return NextResponse.json(ledger.listAccounts());
}
