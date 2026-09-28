"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIDR } from "@/lib/format";

const BANKS = ["BANK_A", "BANK_B", "BANK_C"];

export default function NewTransferPage() {
  const router = useRouter();
  const [amount, setAmount] = useState("150000");
  const [sourceBank, setSourceBank] = useState("BANK_A");
  const [destBank, setDestBank] = useState("BANK_B");
  const [destAccount, setDestAccount] = useState("1234567");
  const [destName, setDestName] = useState("Alice");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const amountValid = Number.isInteger(amountNum) && amountNum > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amountValid) {
      setError("Amount must be a positive whole number (in rupiah).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // A fresh idempotency key per submit attempt.
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          amount: amountNum,
          source_bank: sourceBank,
          dest_bank: destBank,
          dest_account_number: destAccount,
          dest_account_name: destName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to create transfer. Check the inputs."
        );
        return;
      }
      router.push(`/transfers/${data.id}`);
    } catch {
      setError("Network error — could not reach the API.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-bold mb-1">Send a transfer</h1>
        <p className="text-slate-500 mb-6 text-sm">
          Create an interbank transfer. We verify the destination account, then
          wait for your deposit before paying the recipient.
        </p>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              Amount (IDR)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
            {amountValid && (
              <p className="mt-1 text-xs text-slate-500">
                {formatIDR(amountNum)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                From bank
              </label>
              <select
                value={sourceBank}
                onChange={(e) => setSourceBank(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              >
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">To bank</label>
              <select
                value={destBank}
                onChange={(e) => setDestBank(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              >
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Destination account number
            </label>
            <input
              value={destAccount}
              onChange={(e) => setDestAccount(e.target.value)}
              placeholder="e.g. 1234567"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Tip: any 6+ digit number works. A number ending in{" "}
              <code className="rounded bg-slate-100 px-1">000</code> simulates
              &ldquo;account not found&rdquo;.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Recipient name
            </label>
            <input
              value={destName}
              onChange={(e) => setDestName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !amountValid}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Creating…" : "Create transfer"}
          </button>
        </form>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold mb-2 text-sm">How it works</h2>
          <ol className="space-y-2 text-xs text-slate-600 list-decimal list-inside">
            <li>You create a transfer → status AWAITING FUNDS.</li>
            <li>You deposit into our settlement account.</li>
            <li>
              The bank webhook confirms the deposit → we pay the recipient →
              COMPLETED.
            </li>
            <li>If the payout is rejected → FAILED → auto REFUNDED.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-xs text-slate-600">
          Every money movement is recorded in a <strong>double-entry
          ledger</strong> that always balances to zero. Check it on the{" "}
          <a href="/accounts" className="text-brand-600 underline">
            Ledger
          </a>{" "}
          page.
        </div>
      </aside>
    </div>
  );
}
