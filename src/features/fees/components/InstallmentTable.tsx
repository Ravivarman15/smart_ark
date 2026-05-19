import { EntityCrudTable, type ColumnDef } from "@/shared/components";
import { formatINR, formatPaymentDate } from "../utils/format";
import type { Installment } from "../types/fee.types";

interface Props {
  installments: Installment[] | undefined;
  loading?: boolean;
}

const columns: ColumnDef<Installment>[] = [
  { key: "date", header: "Date", cell: (r) => formatPaymentDate(r.date) },
  { key: "receiptNo", header: "Receipt #", cell: (r) => r.receiptNo || "—" },
  { key: "method", header: "Method", cell: (r) => r.method },
  {
    key: "amount",
    header: <span className="text-right block">Amount</span>,
    className: "text-right",
    cell: (r) => formatINR(r.amount),
  },
];

// Read-only chronological ledger of payments for one fee.
// Uses EntityCrudTable so styling / empty / loading states stay consistent.
export const InstallmentTable = ({ installments, loading }: Props) => (
  <EntityCrudTable<Installment>
    rows={installments}
    columns={columns}
    rowKey={(r) => r.id}
    loading={loading}
    emptyMessage="No payments recorded yet"
  />
);
