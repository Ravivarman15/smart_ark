import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  PiggyBank,
  Receipt,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApprovalDialog,
  CategoryBreakdownChart,
  FinanceFiltersBar,
  FinanceKpiCard,
  FinancePageShell,
  TransactionTable,
  TrendChart,
} from "../components";
import {
  useBulkApproveTransactions,
  useBulkDeleteTransactions,
  useDeleteTransaction,
  useFinanceTransactions,
  useMarkTransactionPaid,
} from "../hooks/useFinanceTransactions";
import { useFinanceAnalytics } from "../hooks/useFinanceAnalytics";
import { formatINR } from "../utils/financeCalc";
import type {
  FinanceFilters,
  FinanceKind,
  FinanceTransaction,
} from "../types/finance.types";

interface Props {
  kind: FinanceKind;
}

// Convert filtered rows into a CSV file the user can download. Pure client
// side, no calculation logic — it just stringifies values the service has
// already computed.
const exportCsv = (rows: FinanceTransaction[], kind: FinanceKind) => {
  if (rows.length === 0) {
    toast.error("Nothing to export");
    return;
  }
  const head = [
    "Date",
    "Title",
    "Category",
    "Amount",
    "Tax",
    "Net",
    "Status",
    "Branch",
    "Department",
    kind === "expense" ? "Vendor" : "Source",
    "Invoice / Ref",
    "Notes",
  ];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date ?? "",
        r.title ?? "",
        r.categoryName ?? r.category,
        r.amount.toFixed(2),
        r.taxAmount.toFixed(2),
        r.netAmount.toFixed(2),
        r.status,
        r.branchName ?? "",
        r.department ?? "",
        kind === "expense" ? (r.vendorName ?? "") : (r.source ?? ""),
        r.invoiceNumber ?? r.transactionReference ?? "",
        (r.notes ?? "").replace(/[\r\n,]+/g, " "),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const ManageTransactionPage = ({ kind }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const addPath = location.pathname.replace(
    /\/manage-(expense|income)$/,
    "/add-$1",
  );
  const editPath = (id: string) => `${addPath}?id=${id}`;

  const [filters, setFilters] = useState<FinanceFilters>({ type: kind });
  const [selected, setSelected] = useState<string[]>([]);
  const [approveTarget, setApproveTarget] =
    useState<{ txn: FinanceTransaction; mode: "approve" | "reject" } | null>(
      null,
    );

  const { data: rows = [], isLoading } = useFinanceTransactions({
    ...filters,
    type: kind,
  });
  const { data: analytics } = useFinanceAnalytics();

  const bulkApprove = useBulkApproveTransactions();
  const bulkDelete = useBulkDeleteTransactions();
  const markPaid = useMarkTransactionPaid();
  const remove = useDeleteTransaction();

  const totals = useMemo(() => {
    const all = rows.reduce(
      (acc, r) => {
        acc.gross += r.amount;
        acc.tax += r.taxAmount;
        acc.net += r.netAmount;
        if (r.status === "pending") acc.pending += 1;
        if (r.status === "paid") acc.paid += 1;
        return acc;
      },
      { gross: 0, tax: 0, net: 0, pending: 0, paid: 0 },
    );
    return all;
  }, [rows]);

  const onBulkApprove = async () => {
    if (selected.length === 0) return;
    try {
      await bulkApprove.mutateAsync(selected);
      toast.success(`Approved ${selected.length} transaction(s)`);
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk approve failed");
    }
  };
  const onBulkDelete = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} transaction(s)? This cannot be undone.`))
      return;
    try {
      await bulkDelete.mutateAsync(selected);
      toast.success(`Deleted ${selected.length} transaction(s)`);
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    }
  };

  const onMarkPaid = async (t: FinanceTransaction) => {
    try {
      await markPaid.mutateAsync(t.id);
      toast.success("Marked as paid");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const onDelete = async (t: FinanceTransaction) => {
    if (!confirm(`Delete "${t.title ?? t.category}"? This cannot be undone.`))
      return;
    try {
      await remove.mutateAsync(t.id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const isIncome = kind === "income";
  const breakdown =
    (isIncome
      ? analytics?.incomeByCategory
      : analytics?.expenseByCategory) ?? [];

  return (
    <FinancePageShell
      title={isIncome ? "Manage Income" : "Manage Expenses"}
      description={
        isIncome
          ? "All revenue records, reconciliation, recurring streams and analytics."
          : "All expense records, approvals, payments, recurring runs and analytics."
      }
      icon={
        isIncome ? <Wallet className="w-5 h-5" /> : <Receipt className="w-5 h-5" />
      }
      primaryAction={{
        label: isIncome ? "Add Income" : "Add Expense",
        onClick: () => navigate(addPath),
      }}
      headerExtra={
        <Button variant="outline" onClick={() => exportCsv(rows, kind)}>
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinanceKpiCard
          label={isIncome ? "Total Income" : "Total Expense"}
          value={formatINR(totals.gross)}
          hint={`${rows.length} transaction(s)`}
          tone={isIncome ? "positive" : "negative"}
          icon={
            isIncome ? (
              <PiggyBank className="w-4 h-4" />
            ) : (
              <Receipt className="w-4 h-4" />
            )
          }
        />
        <FinanceKpiCard
          label="Tax"
          value={formatINR(totals.tax)}
          hint="Across filtered rows"
          tone="info"
        />
        <FinanceKpiCard
          label="Net"
          value={formatINR(totals.net)}
          hint={isIncome ? "After tax received" : "After tax paid"}
          tone="default"
        />
        <FinanceKpiCard
          label="Pending Approval"
          value={String(totals.pending)}
          hint={`${totals.paid} paid`}
          tone="warning"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FinanceFiltersBar
                kind={kind}
                filters={filters}
                onChange={setFilters}
              />
              {selected.length > 0 && (
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <span>{selected.length} selected</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onBulkApprove}
                      disabled={bulkApprove.isPending}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Bulk approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600"
                      onClick={onBulkDelete}
                      disabled={bulkDelete.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Bulk delete
                    </Button>
                  </div>
                </div>
              )}
              <TransactionTable
                rows={rows}
                loading={isLoading}
                selectable
                selectedIds={selected}
                onSelectionChange={setSelected}
                rowActions={(t) => [
                  { label: "Edit", onClick: () => navigate(editPath(t.id)) },
                  ...(t.status === "pending"
                    ? [
                        {
                          label: "Approve",
                          onClick: () =>
                            setApproveTarget({ txn: t, mode: "approve" }),
                        },
                        {
                          label: "Reject",
                          destructive: true,
                          onClick: () =>
                            setApproveTarget({ txn: t, mode: "reject" }),
                        },
                      ]
                    : []),
                  ...(t.status !== "paid" && t.status !== "rejected"
                    ? [{ label: "Mark as paid", onClick: () => onMarkPaid(t) }]
                    : []),
                  {
                    label: "Delete",
                    destructive: true,
                    separatorBefore: true,
                    onClick: () => onDelete(t),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <CategoryBreakdownChart
            items={breakdown}
            title={isIncome ? "Income by category" : "Expense by category"}
            tone={isIncome ? "income" : "expense"}
          />
          {analytics?.monthlyTrend && (
            <TrendChart points={analytics.monthlyTrend} />
          )}
        </div>
      </div>

      {approveTarget && (
        <ApprovalDialog
          open
          onOpenChange={(v) => {
            if (!v) setApproveTarget(null);
          }}
          txn={approveTarget.txn}
          mode={approveTarget.mode}
        />
      )}
    </FinancePageShell>
  );
};

export const ManageExpensePage = () => <ManageTransactionPage kind="expense" />;
export const ManageIncomePage = () => <ManageTransactionPage kind="income" />;

export default ManageTransactionPage;
