"use client";

import useSWR from "swr";
import { Account } from "@/lib/types";
import { formatIDR } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TYPE_LABEL: Record<Account["type"], string> = {
  SETTLEMENT: "Settlement (Flip bank accounts)",
  LIABILITY: "Liability (owed to users)",
  REVENUE: "Revenue (fees earned)",
};

const TYPE_STYLE: Record<Account["type"], string> = {
  SETTLEMENT: "bg-sky-100 text-sky-800",
  LIABILITY: "bg-amber-100 text-amber-800",
  REVENUE: "bg-emerald-100 text-emerald-800",
};

export default function AccountsPage() {
  const { data: accounts } = useSWR<Account[]>("/api/accounts", fetcher, {
    refreshInterval: 4000,
  });
  const { data: health } = useSWR<{
    ok: boolean;
    mode: string;
    ledger_balanced: boolean;
  }>("/api/health", fetcher, { refreshInterval: 4000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ledger</h1>
        <p className="text-slate-500 text-sm">
          Internal accounts and their balances. In a correct double-entry system
          the whole ledger always sums to zero.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-400 text-xs">System status</div>
          <div className="mt-1 text-lg font-semibold">
            {health?.ok ? "Healthy" : "…"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-400 text-xs">Mode</div>
          <div className="mt-1 text-lg font-semibold">
            {health?.mode ?? "…"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-400 text-xs">Ledger balanced?</div>
          <div
            className={`mt-1 text-lg font-semibold ${
              health?.ledger_balanced ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {health === undefined
              ? "…"
              : health.ledger_balanced
                ? "✅ Yes (sums to 0)"
                : "❌ No"}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!accounts && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {accounts?.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLE[a.type]}`}
                    title={TYPE_LABEL[a.type]}
                  >
                    {a.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatIDR(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Balances return to zero once transfers complete because money flows
        through the settlement account and out to recipients — it is never held
        long-term in this demo.
      </p>
    </div>
  );
}
