import { useMemo, useState } from "react";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { EntityCrudTable, type ColumnDef } from "@/shared/components";
import {
  CategoryDot,
  CategoryEditorDialog,
  FinancePageShell,
} from "../components";
import {
  useDeleteFinanceCategory,
  useFinanceCategories,
  useToggleFinanceCategory,
} from "../hooks/useFinanceCategories";
import type { FinanceCategory, FinanceKind } from "../types/finance.types";

interface Props {
  kind: FinanceKind;
}

const ManageTypePage = ({ kind }: Props) => {
  const { data: rows = [], isLoading } = useFinanceCategories(kind);
  const toggle = useToggleFinanceCategory();
  const remove = useDeleteFinanceCategory();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceCategory | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (c: FinanceCategory) => {
    setEditing(c);
    setEditorOpen(true);
  };
  const onToggle = async (c: FinanceCategory) => {
    try {
      await toggle.mutateAsync({ id: c.id, isActive: !c.isActive });
      toast.success(c.isActive ? "Deactivated" : "Activated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };
  const onDelete = async (c: FinanceCategory) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const columns = useMemo<ColumnDef<FinanceCategory>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        cell: (c) => (
          <div className="space-y-0.5">
            <div className="font-medium flex items-center gap-1.5">
              <CategoryDot color={c.color} />
              <span>{c.name}</span>
              {c.isRecurring && (
                <Badge variant="outline" className="text-[10px] py-0">
                  Recurring
                </Badge>
              )}
            </div>
            {c.parentName && (
              <div className="text-[11px] text-muted-foreground">
                Parent: {c.parentName}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "tax",
        header: "Tax",
        cell: (c) =>
          c.taxName ? `${c.taxName} (${c.taxPercentage ?? 0}%)` : "—",
      },
      ...(kind === "income"
        ? [
            {
              key: "scope",
              header: "Scope",
              cell: (c: FinanceCategory) => (
                <span className="capitalize text-muted-foreground text-xs">
                  {c.scope}
                </span>
              ),
            } as ColumnDef<FinanceCategory>,
          ]
        : []),
      {
        key: "budget",
        header: "Monthly Budget",
        cell: (c) => (c.monthlyBudget ? `₹${c.monthlyBudget}` : "—"),
      },
      {
        key: "status",
        header: "Status",
        cell: (c) => (
          <Badge variant={c.isActive ? "default" : "outline"}>
            {c.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [kind],
  );

  return (
    <FinancePageShell
      title={`Manage ${kind === "income" ? "Income" : "Expense"} Types`}
      description={`Categories drive analytics, budgets and reporting for ${kind === "income" ? "incomes" : "expenses"}.`}
      icon={<Tags className="w-5 h-5" />}
      primaryAction={{
        label: `Add ${kind === "income" ? "Income" : "Expense"} Type`,
        onClick: openCreate,
      }}
    >
      <EntityCrudTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={isLoading}
        emptyMessage={
          kind === "income"
            ? "No income types yet"
            : "No expense types yet — add one to start categorising"
        }
        rowActions={(c) => [
          { label: "Edit", onClick: () => openEdit(c) },
          {
            label: c.isActive ? "Deactivate" : "Activate",
            onClick: () => onToggle(c),
          },
          {
            label: "Delete",
            destructive: true,
            onClick: () => onDelete(c),
          },
        ]}
      />
      <CategoryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        kind={kind}
        existing={editing}
      />
    </FinancePageShell>
  );
};

export const ManageExpenseTypePage = () => <ManageTypePage kind="expense" />;
export const ManageIncomeTypePage = () => <ManageTypePage kind="income" />;

export default ManageTypePage;
