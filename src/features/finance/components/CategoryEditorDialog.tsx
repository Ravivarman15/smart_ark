import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EntityFormModal } from "@/shared/components";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinanceFormField } from "./FinancePageShell";
import {
  useCreateFinanceCategory,
  useFinanceCategories,
  useUpdateFinanceCategory,
} from "../hooks/useFinanceCategories";
import { useFinanceLookups } from "../hooks/useFinanceLookups";
import { financeCategorySchema } from "../schemas/finance.schema";
import type {
  FinanceCategory,
  FinanceKind,
  IncomeScope,
} from "../types/finance.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: FinanceKind;
  existing?: FinanceCategory | null;
}

interface FormState {
  name: string;
  parentId: string;
  description: string;
  color: string;
  icon: string;
  isActive: boolean;
  isRecurring: boolean;
  taxId: string;
  monthlyBudget: string;
  sortOrder: string;
  scope: IncomeScope;
}

const EMPTY: FormState = {
  name: "",
  parentId: "",
  description: "",
  color: "#0ea5e9",
  icon: "",
  isActive: true,
  isRecurring: false,
  taxId: "",
  monthlyBudget: "",
  sortOrder: "0",
  scope: "internal",
};

export const CategoryEditorDialog = ({
  open,
  onOpenChange,
  kind,
  existing,
}: Props) => {
  const create = useCreateFinanceCategory();
  const update = useUpdateFinanceCategory();
  const { data: lookups } = useFinanceLookups();
  const { data: categories = [] } = useFinanceCategories(kind);

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        name: existing.name,
        parentId: existing.parentId ?? "",
        description: existing.description ?? "",
        color: existing.color ?? "#0ea5e9",
        icon: existing.icon ?? "",
        isActive: existing.isActive,
        isRecurring: existing.isRecurring,
        taxId: existing.taxId ?? "",
        monthlyBudget:
          existing.monthlyBudget === undefined || existing.monthlyBudget === null
            ? ""
            : String(existing.monthlyBudget),
        sortOrder: String(existing.sortOrder ?? 0),
        scope: existing.scope ?? "internal",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, existing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = financeCategorySchema.safeParse({
      ...form,
      kind,
      parentId: form.parentId || undefined,
      taxId: form.taxId || undefined,
      monthlyBudget: form.monthlyBudget || "",
      sortOrder: form.sortOrder || 0,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, input: parsed.data });
        toast.success(
          `${kind === "income" ? "Income" : "Expense"} type updated`,
        );
      } else {
        await create.mutateAsync(parsed.data);
        toast.success(
          `${kind === "income" ? "Income" : "Expense"} type created`,
        );
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const submitting = create.isPending || update.isPending;
  const taxes = lookups?.taxes ?? [];
  const parents = categories.filter((c) => !existing || c.id !== existing.id);

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        existing
          ? `Edit ${kind === "income" ? "Income" : "Expense"} Type`
          : `Add ${kind === "income" ? "Income" : "Expense"} Type`
      }
      description="Categorise transactions for analytics, budgets and reporting."
      submitLabel={existing ? "Save changes" : "Create"}
      isSubmitting={submitting}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FinanceFormField label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={kind === "income" ? "e.g. Tuition Fees" : "e.g. Utilities"}
            autoFocus
          />
        </FinanceFormField>
        <FinanceFormField label="Parent Category">
          <Select value={form.parentId || "none"} onValueChange={(v) => set("parentId", v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="No parent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No parent</SelectItem>
              {parents.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FinanceFormField>

        <FinanceFormField label="Tax">
          <Select value={form.taxId || "none"} onValueChange={(v) => set("taxId", v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="No tax" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.percentage}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FinanceFormField>

        {kind === "income" && (
          <FinanceFormField label="Scope">
            <Select value={form.scope} onValueChange={(v) => set("scope", v as IncomeScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="external">External</SelectItem>
                <SelectItem value="fee">Fee-linked</SelectItem>
              </SelectContent>
            </Select>
          </FinanceFormField>
        )}

        <FinanceFormField label="Monthly Budget (₹)">
          <Input
            type="number"
            value={form.monthlyBudget}
            onChange={(e) => set("monthlyBudget", e.target.value)}
            placeholder="Optional"
          />
        </FinanceFormField>

        <FinanceFormField label="Sort Order">
          <Input
            type="number"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
        </FinanceFormField>

        <FinanceFormField label="Color">
          <Input
            type="color"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="h-9 w-20 p-1"
          />
        </FinanceFormField>

        <FinanceFormField label="Icon (lucide name)">
          <Input
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            placeholder="e.g. Wallet"
          />
        </FinanceFormField>
      </div>

      <FinanceFormField label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder="Optional"
        />
      </FinanceFormField>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span className="text-xs font-medium">Active</span>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => set("isActive", v)}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span className="text-xs font-medium">Mark as recurring</span>
          <Switch
            checked={form.isRecurring}
            onCheckedChange={(v) => set("isRecurring", v)}
          />
        </label>
      </div>
    </EntityFormModal>
  );
};
