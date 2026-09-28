import { NextRequest, NextResponse } from "next/server";
import * as transfers from "@/lib/transfers";
import * as ledger from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  transfers.ensureSeeded();
  const transfer = transfers.getTransfer(id);
  if (!transfer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ...transfer,
    ledger_entries: ledger.entriesForTransfer(transfer.id),
  });
}
