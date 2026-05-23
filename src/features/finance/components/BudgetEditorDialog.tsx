import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EntityFormModal } from "@/shared/components";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinanceFormField } from "./FinancePageShell";
import {
  useCreateBudget,
  useUpdateBudget,
} from "../hooks/useFinanceBudgets";
import { useFinanceCategories } from "../hooks/useFinanceCategories";
import { useFinanceLookups } from "../hooks/useFinanceLookups";
import { financeBudgetSchema } from "../schemas/finance.schema";
import type {
  BudgetPeriod,
  FinanceBudget,
} from "../types/finance.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: FinanceBudget | null;
}

interface FormState {
  categoryId: string;
  period: BudgetPeriod;
  periodStart: string;
  amount: string;
  alertThreshold: string;
  branchId: string;
  notes: string;
}

const today = new Date().toISOString().slice(0, 10);

const EMPTY: FormState = {
  categoryId: "",
  period: "monthly",
  periodStart: today,
  amount: "",
  alertThreshold: "80",
  branchId: "",
  notes: "",
};

export const BudgetEditorDialog = ({ open, onOpenChange, existing }: Props) => {
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const { data: categories = [] } = useFinanceCategories("expense");
  const { data: lookups } = useFinanceLookups();

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        categoryId: existing.categoryId,
        period: existing.period,
        periodStart: existing.periodStart.slice(0, 10),
        amount: String(existing.amount),
        alertThreshold: String(existing.alertThreshold),
        branchId: existing.branchId ?? "",
        notes: existing.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, existing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = financeBudgetSchema.safeParse({
      ...form,
      branchId: form.branchId || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, input: parsed.data });
        toast.success("Budget updated");
      } else {
        await create.mutateAsync(parsed.data);
        toast.success("Budget created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const submitting = create.isPending || update.isPending;
  const branches = lookups?.branches ?? [];

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? "Edit Budget" : "Add Budget"}
      description="Set spending limits by category, period and branch with alert thresholds."
      submitLabel={existing ? "Save changes" : "Create"}
      isSubmitting={submitting}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FinanceFormField label="Category" required>
          <Select
            value={form.categoryId}
            onValueChange={(v) => set("categoryId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FinanceFormField>
        <FinanceFormField label="Period">
          <Select
            value={form.period}
            onValueChange={(v) => set("period", v as BudgetPeriod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </FinanceFormField>
        <FinanceFormField label="Period Start" required>
          <Input
            type="date"
            value={form.periodStart}
            onChange={(e) => set("periodStart", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Amount (₹)" required>
          <Input
            type="number"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Alert Threshold (%)">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.alertThreshold}
            onChange={(e) => set("alertThreshold", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Branch">
          <Select
            value={form.branchId || "none"}
            onValueChange={(v) => set("branchId", v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FinanceFormField>
      </div>
      <FinanceFormField label="Notes">
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
        />
      </FinanceFormField>
    </EntityFormModal>
  );
};
