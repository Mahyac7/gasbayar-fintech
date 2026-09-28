"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { LedgerEntry, Transfer } from "@/lib/types";
import { formatIDR, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

type TransferDetail = Transfer & { ledger_entries: LedgerEntry[] };

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error((await r.json()).error || "error");
    return r.json();
  });

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useSWR<TransferDetail>(
    id ? `/api/transfers/${id}` : null,
    fetcher
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function triggerFundsReceived() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/transfers/${id}/funds-received`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setActionError(body.error || "Action failed");
      } else {
        await mutate();
      }
    } catch {
      setActionError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;
  if (error || !data)
    return (
      <div>
        <p className="text-red-600 text-sm mb-4">Transfer not found.</p>
        <Link href="/transfers" className="text-brand-600 underline text-sm">
          ← Back to transfers
        </Link>
      </div>
    );

  const canReceiveFunds = data.status === "AWAITING_FUNDS";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/transfers"
          className="text-brand-600 hover:underline text-sm"
        >
          ← Transfers
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold">{formatIDR(data.amount)}</div>
            <div className="text-slate-500 mt-1">
              {data.source_bank} → {data.dest_bank} · {data.dest_account_name} (
              {data.dest_account_number})
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">Transfer ID</dt>
            <dd className="font-mono text-xs break-all">{data.id}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Fee</dt>
            <dd>{formatIDR(data.fee)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Created</dt>
            <dd>{formatDateTime(data.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Updated</dt>
            <dd>{formatDateTime(data.updated_at)}</dd>
          </div>
          {data.failure_reason && (
            <div>
              <dt className="text-slate-400">Failure reason</dt>
              <dd className="text-red-600">{data.failure_reason}</dd>
            </div>
          )}
        </dl>

        {canReceiveFunds && (
          <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 mb-3">
              This transfer is waiting for your deposit. Simulate the bank
              telling us the money arrived — this triggers the payout.
            </p>
            <button
              onClick={triggerFundsReceived}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "Processing…" : "Simulate deposit received →"}
            </button>
            {actionError && (
              <p className="mt-2 text-sm text-red-700">{actionError}</p>
            )}
          </div>
        )}

        {data.status === "COMPLETED" && (
          <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            ✅ Payout completed — the recipient has been credited.
          </div>
        )}
        {data.status === "REFUNDED" && (
          <div className="mt-6 rounded-lg bg-purple-50 border border-purple-200 p-4 text-sm text-purple-800">
            ↩️ Payout failed at the destination bank, so the transfer was
            automatically refunded.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold mb-1">Ledger entries</h2>
        <p className="text-slate-400 text-xs mb-4">
          Double-entry postings for this transfer. Credits (+) and debits (−)
          always net to zero.
        </p>
        {data.ledger_entries.length === 0 ? (
          <p className="text-slate-400 text-sm">
            No entries yet — postings appear once funds are received.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 font-medium">Memo</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ledger_entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-slate-600">{e.memo}</td>
                  <td
                    className={`py-2 text-right font-mono ${
                      e.amount >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {e.amount >= 0 ? "+" : ""}
                    {formatIDR(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
