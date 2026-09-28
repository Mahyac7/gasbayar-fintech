import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as transfers from "@/lib/transfers";

export const dynamic = "force-dynamic";

const createTransferSchema = z.object({
  amount: z.number().int().positive(),
  source_bank: z.string().min(1),
  dest_bank: z.string().min(1),
  dest_account_number: z.string().min(1),
  dest_account_name: z.string().min(1),
});

export async function GET() {
  transfers.ensureSeeded();
  return NextResponse.json(transfers.listTransfers());
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const idempotencyKey = req.headers.get("Idempotency-Key") || undefined;

  try {
    const transfer = await transfers.createTransfer(parsed.data, idempotencyKey);
    return NextResponse.json(transfer, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
