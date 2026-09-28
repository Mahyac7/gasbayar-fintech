"use client";

import Link from "next/link";
import useSWR from "swr";
import { Transfer } from "@/lib/types";
import { formatIDR, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TransfersPage() {
  const { data, error, isLoading } = useSWR<Transfer[]>(
    "/api/transfers",
    fetcher,
    { refreshInterval: 4000 }
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Transfers</h1>
          <p className="text-slate-500 text-sm">
            All transfers in this instance (auto-refreshes).
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New transfer
        </Link>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 text-sm">Failed to load transfers.</p>
      )}

      {data && data.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No transfers yet.</p>
          <Link href="/" className="text-brand-600 underline text-sm">
            Create your first transfer
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {formatIDR(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.source_bank} → {t.dest_bank}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.dest_account_name}
                    <span className="text-slate-400">
                      {" "}
                      ·{t.dest_account_number}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDateTime(t.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/transfers/${t.id}`}
                      className="text-brand-600 hover:underline text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
