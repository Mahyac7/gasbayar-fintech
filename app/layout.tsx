import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gasbayar — Interbank Transfer MVP",
  description:
    "A Flip-style money-transfer demo: double-entry ledger, idempotency, a transfer state machine, and a mock bank service.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold">
                  G
                </span>
                <span className="font-semibold text-lg">Gasbayar</span>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  transfer MVP
                </span>
              </Link>
              <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
                <Link href="/" className="hover:text-brand-600">
                  New transfer
                </Link>
                <Link href="/transfers" className="hover:text-brand-600">
                  Transfers
                </Link>
                <Link href="/accounts" className="hover:text-brand-600">
                  Ledger
                </Link>
                <a
                  href="https://github.com/Mahyac7/gasbayar-fintech"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-600"
                >
                  GitHub ↗
                </a>
              </nav>
            </div>
          </header>

          <div className="bg-amber-50 border-b border-amber-200">
            <div className="mx-auto max-w-5xl px-4 py-2 text-xs text-amber-800">
              ⚠️ <strong>Demo mode:</strong> in-memory store — data is not
              persistent and resets when the serverless instance recycles. Not a
              regulated financial service.
            </div>
          </div>

          <main className="mx-auto max-w-5xl w-full px-4 py-8 flex-1">
            {children}
          </main>

          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-400">
              Gasbayar — a Flip-style interbank transfer demo. Double-entry
              ledger · idempotency · state machine · mock bank.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
