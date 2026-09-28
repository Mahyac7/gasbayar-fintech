import { TransferStatus } from "./types";

/** Format integer minor units as Indonesian Rupiah. */
export function formatIDR(minorUnits: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(minorUnits);
}

/** Tailwind color classes for each transfer status badge. */
export const STATUS_STYLES: Record<TransferStatus, string> = {
  CREATED: "bg-slate-100 text-slate-700",
  AWAITING_FUNDS: "bg-amber-100 text-amber-800",
  FUNDS_RECEIVED: "bg-sky-100 text-sky-800",
  DISBURSING: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  REFUNDED: "bg-purple-100 text-purple-800",
  EXPIRED: "bg-slate-200 text-slate-600",
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
