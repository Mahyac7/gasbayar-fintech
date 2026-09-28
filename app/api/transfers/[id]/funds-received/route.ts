import { NextRequest, NextResponse } from "next/server";
import * as transfers from "@/lib/transfers";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  transfers.ensureSeeded();
  const existing = transfers.getTransfer(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const transfer = await transfers.handleFundsReceived(id);
    return NextResponse.json(transfer);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
