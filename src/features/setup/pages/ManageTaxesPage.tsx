import { useState } from "react";
import { Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDeleteDialog,
  EmptyState,
  EntityFormSheet,
  EntityTable,
  FormField,
  RowActions,
  SetupPageShell,
  StatusChip,
  type Column,
} from "../components";
import { useCreateTax, useDeleteTax, useTaxes, useUpdateTax } from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { taxSchema } from "../schemas/setup.schema";
import { formatTaxValue, validate } from "../utils";
import type { Tax } from "../types/setup.types";

interface FormState {
  name: string;
  taxType: "percentage" | "fixed";
  percentage: string;
  amount: string;
  isActive: boolean;
}

const blank: FormState = {
  name: "",
  taxType: "percentage",
  percentage: "",
  amount: "",
  isActive: true,
};

const ManageTaxesPage = () => {
  const { data: rows = [], isLoading } = useTaxes();
  const createMut = useCreateTax();
  const updateMut = useUpdateTax();
  const deleteMut = useDeleteTax();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (t: Tax) => {
    setEditing(t);
    setForm({
      name: t.name,
      taxType: t.taxType,
      percentage: t.percentage ? String(t.percentage) : "",
      amount: t.amount != null ? String(t.amount) : "",
      isActive: t.isActive,
    });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const candidate = {
      name: form.name,
      taxType: form.taxType,
      percentage: form.percentage === "" ? undefined : Number(form.percentage),
      amount: form.amount === "" ? undefined : Number(form.amount),
      isActive: form.isActive,
    };
    const result = validate(taxSchema, candidate);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    if (editing) {
      updateMut.mutate(
        { id: editing.id, input: result.data },
        { onSuccess: () => setSheetOpen(false) }
      );
    } else {
      createMut.mutate(result.data, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete, { onSuccess: () => setSheetOpen(false) });
    setPendingDelete(null);
  };

  const columns: Column<Tax>[] = [
    {
      key: "name",
      header: "Tax name",
      cell: (t) => <span className="font-medium text-foreground">{t.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      cell: (t) => <span className="capitalize text-muted-foreground">{t.taxType}</span>,
    },
    {
      key: "value",
      header: "Value",
      cell: (t) => (
        <span className="font-medium text-foreground">
          {formatTaxValue(t.taxType, t.percentage, t.amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => <StatusChip active={t.isActive} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <RowActions onEdit={() => openEdit(t)} onDelete={() => setPendingDelete(t.id)} />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Manage Taxes"
      description="Configure the taxes applied to fee structures and collections (e.g. GST, service charges)."
      icon={<Percent className="w-5 h-5" />}
      primaryAction={{ label: "Add Tax", onClick: openCreate }}
    >
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<Percent className="w-5 h-5" />}
            title="No taxes configured"
            description="Add a percentage or fixed tax to apply it on fee collection."
            action={{ label: "Add Tax", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Tax" : "Add Tax"}
        description="Taxes are selectable when building fee structures."
        submitLabel={editing ? "Save changes" : "Create tax"}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Tax name" required error={errors.name}>
          <Input
            placeholder="e.g. GST 18%"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField label="Tax type" required error={errors.taxType}>
          <Select
            value={form.taxType}
            onValueChange={(v) =>
              setForm({ ...form, taxType: v as "percentage" | "fixed" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="fixed">Fixed amount (₹)</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {form.taxType === "percentage" ? (
          <FormField
            label="Percentage"
            required
            error={errors.percentage}
            hint="Value between 0 and 100."
          >
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="18"
              value={form.percentage}
              onChange={(e) => setForm({ ...form, percentage: e.target.value })}
            />
          </FormField>
        ) : (
          <FormField label="Fixed amount (₹)" required error={errors.amount}>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="500"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>
        )}
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Active</p>
            <p className="text-[11px] text-muted-foreground">
              Only active taxes appear when building fee structures.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
        </div>
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete tax?"
        description="Fee structures using this tax may need updating. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageTaxesPage;
