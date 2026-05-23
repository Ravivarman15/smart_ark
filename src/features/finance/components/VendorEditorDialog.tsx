import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EntityFormModal } from "@/shared/components";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FinanceFormField } from "./FinancePageShell";
import { useCreateVendor, useUpdateVendor } from "../hooks/useVendors";
import { vendorSchema } from "../schemas/finance.schema";
import type { Vendor } from "../types/finance.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Vendor | null;
}

interface FormState {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  gstNumber: "",
  address: "",
  paymentTerms: "Net 30",
  notes: "",
  isActive: true,
};

export const VendorEditorDialog = ({ open, onOpenChange, existing }: Props) => {
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        name: existing.name,
        contactPerson: existing.contactPerson ?? "",
        email: existing.email ?? "",
        phone: existing.phone ?? "",
        gstNumber: existing.gstNumber ?? "",
        address: existing.address ?? "",
        paymentTerms: existing.paymentTerms ?? "",
        notes: existing.notes ?? "",
        isActive: existing.isActive,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, existing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = vendorSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, input: parsed.data });
        toast.success("Vendor updated");
      } else {
        await create.mutateAsync(parsed.data);
        toast.success("Vendor created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const submitting = create.isPending || update.isPending;

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? "Edit Vendor" : "Add Vendor"}
      description="Maintain a centralised vendor list to track payments and history."
      submitLabel={existing ? "Save changes" : "Create"}
      isSubmitting={submitting}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FinanceFormField label="Vendor Name" required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </FinanceFormField>
        <FinanceFormField label="Contact Person">
          <Input
            value={form.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </FinanceFormField>
        <FinanceFormField label="GST Number">
          <Input
            value={form.gstNumber}
            onChange={(e) => set("gstNumber", e.target.value)}
          />
        </FinanceFormField>
        <FinanceFormField label="Payment Terms">
          <Input
            value={form.paymentTerms}
            onChange={(e) => set("paymentTerms", e.target.value)}
            placeholder="e.g. Net 30"
          />
        </FinanceFormField>
      </div>
      <FinanceFormField label="Address">
        <Textarea
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          rows={2}
        />
      </FinanceFormField>
      <FinanceFormField label="Notes">
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
        />
      </FinanceFormField>
      <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
        <span className="text-xs font-medium">Active</span>
        <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
      </label>
    </EntityFormModal>
  );
};
