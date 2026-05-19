import { EntityCrudTable, type ColumnDef } from "@/shared/components";
import { formatINR, formatPaymentDate } from "../utils/format";
import { FeeStatusBadge } from "./FeeStatusBadge";
import type { FeeRecord } from "../types/fee.types";

interface Props {
  fees: FeeRecord[] | undefined;
  loading?: boolean;
  onRowClick?: (fee: FeeRecord) => void;
}

const columns: ColumnDef<FeeRecord>[] = [
  { key: "student", header: "Student", cell: (f) => f.student },
  { key: "batch", header: "Batch", cell: (f) => f.batch || "—" },
  {
    key: "amount",
    header: <span className="text-right block">Final</span>,
    className: "text-right",
    cell: (f) => formatINR(f.finalAmount ?? f.amount),
  },
  {
    key: "received",
    header: <span className="text-right block">Received</span>,
    className: "text-right",
    cell: (f) => formatINR(f.received ?? 0),
  },
  {
    key: "pending",
    header: <span className="text-right block">Pending</span>,
    className: "text-right",
    cell: (f) => formatINR(f.pending ?? 0),
  },
  {
    key: "status",
    header: "Status",
    cell: (f) => <FeeStatusBadge status={f.status} paid={f.paid} />,
  },
  { key: "paidDate", header: "Last update", cell: (f) => formatPaymentDate(f.paidDate) },
];

/**
 * Cross-student fee ledger. Designed for the admin "Fees & Admissions" view.
 * Per-row actions (collect / refund / discount) should be wired by the
 * consuming page via a custom column rather than baked in here — keeps
 * permission logic close to the page that owns it.
 */
export const PaymentHistoryTable = ({ fees, loading, onRowClick: _onRowClick }: Props) => (
  <EntityCrudTable<FeeRecord>
    rows={fees}
    columns={columns}
    rowKey={(f) => f.id}
    loading={loading}
    emptyMessage="No fee records yet"
  />
);
