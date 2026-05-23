import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityCrudTable, type ColumnDef } from "@/shared/components";
import type { EntityAction } from "@/shared/components";
import { formatINR } from "../utils/financeCalc";
import { CategoryDot } from "./CategoryDot";
import { StatusChip } from "./StatusChip";
import { RecurringBadge } from "./RecurringBadge";
import type { FinanceTransaction } from "../types/finance.types";

interface Props {
  rows: FinanceTransaction[] | undefined;
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  rowActions?: (row: FinanceTransaction) => EntityAction[];
}

const formatDate = (d?: string) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
};

export const TransactionTable = ({
  rows,
  loading,
  selectable,
  selectedIds = [],
  onSelectionChange,
  rowActions,
}: Props) => {
  const [internalSel, setInternalSel] = useState<string[]>([]);
  const selected = onSelectionChange ? selectedIds : internalSel;
  const setSel = onSelectionChange ?? setInternalSel;

  const toggleAll = () => {
    if (!rows) return;
    if (selected.length === rows.length) setSel([]);
    else setSel(rows.map((r) => r.id));
  };
  const toggleOne = (id: string) =>
    setSel(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const columns = useMemo<ColumnDef<FinanceTransaction>[]>(() => {
    const cols: ColumnDef<FinanceTransaction>[] = [];
    if (selectable) {
      cols.push({
        key: "select",
        header: (
          <Checkbox
            checked={!!rows && rows.length > 0 && selected.length === rows.length}
            onCheckedChange={toggleAll}
            aria-label="Select all"
          />
        ),
        cell: (r) => (
          <Checkbox
            checked={selected.includes(r.id)}
            onCheckedChange={() => toggleOne(r.id)}
            aria-label={`Select ${r.title ?? r.category}`}
          />
        ),
        className: "w-10",
      });
    }
    cols.push(
      {
        key: "title",
        header: "Title",
        cell: (r) => (
          <div className="space-y-0.5">
            <div className="font-medium text-sm flex items-center gap-1.5">
              <CategoryDot color={r.categoryColor} />
              <span>{r.title ?? r.category}</span>
              <RecurringBadge show={r.isRecurring} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {r.categoryName ?? r.category}
              {r.vendorName ? ` · ${r.vendorName}` : ""}
              {r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""}
            </div>
          </div>
        ),
      },
      { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
      {
        key: "amount",
        header: "Amount",
        cell: (r) => (
          <div className="text-right space-y-0.5">
            <div className={`font-semibold ${r.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
              {r.type === "income" ? "+" : "−"} {formatINR(r.amount)}
            </div>
            {r.taxAmount > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Tax {formatINR(r.taxAmount)}
              </div>
            )}
          </div>
        ),
        className: "text-right",
      },
      {
        key: "branch",
        header: "Branch / Dept",
        cell: (r) => (
          <div className="text-xs">
            <div>{r.branchName ?? "—"}</div>
            <div className="text-muted-foreground">{r.department ?? ""}</div>
          </div>
        ),
      },
      { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
    );
    return cols;
  }, [selectable, selected, rows]);

  return (
    <EntityCrudTable
      rows={rows}
      columns={columns}
      loading={loading}
      rowKey={(r) => r.id}
      rowActions={rowActions}
      emptyMessage="No transactions yet"
    />
  );
};
