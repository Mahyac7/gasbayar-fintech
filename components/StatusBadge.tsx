import { TransferStatus } from "@/lib/types";
import { STATUS_STYLES } from "@/lib/format";

export function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
