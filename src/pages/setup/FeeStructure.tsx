import React, { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2, Percent, Info, History, Users, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac";
import {
  AssignFeeDialog,
  AutoAssignFeesDialog,
  RevisionHistoryDialog,
  computeBreakdown,
  formatINR,
  useCreateFeeStructure,
  useDeleteFeeStructure,
  useFeeLookups,
  useFeeStructures,
  useUpdateFeeStructure,
  type FeeStructure,
  type FeeStructureInput,
  type FeeType,
} from "@/features/fee";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Structures — fee templates used at admission.
//
// Migrated onto the Fee feature module: all data flows through React Query
// hooks + services, and every rupee figure comes from the centralised
// calculation layer (`computeBreakdown`). The page owns only UI state.
// ─────────────────────────────────────────────────────────────────────────────

const FEE_TYPES: { value: FeeType; label: string }[] = [
  { value: "one_time", label: "One-time" },
  { value: "recurring", label: "Recurring" },
  { value: "transport", label: "Transport" },
  { value: "material", label: "Material" },
];

const blankForm = {
  name: "",
  description: "",
  course_type_id: "",
  standard_id: "",
  academic_year_id: "",
  tax_id: "",
  batch_id: "",
  fee_type: "one_time" as FeeType,
  total_amount: "",
  seat_confirmation_amount: "",
  first_payment_amount: "",
  installment_count: "2",
  transport_fee: "",
  material_fee: "",
  recurring_interval: "monthly",
};
type FormState = typeof blankForm;

const FeeStructurePage: React.FC = () => {
  const { refreshData } = useAppData();
  const { canDo } = useCanDo();

  const { data: structures = [], isLoading } = useFeeStructures();
  const { data: lookups } = useFeeLookups();
  const createMut = useCreateFeeStructure();
  const updateMut = useUpdateFeeStructure();
  const deleteMut = useDeleteFeeStructure();

  const courseTypes = lookups?.courseTypes ?? [];
  const standards = lookups?.standards ?? [];
  const taxes = lookups?.taxes ?? [];
  const years = lookups?.academicYears ?? [];
  const batches = lookups?.batches ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<FeeStructure | null>(null);
  const [assignOf, setAssignOf] = useState<FeeStructure | null>(null);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const getName = (arr: { id: string; name: string }[], id?: string) =>
    arr.find((a) => a.id === id)?.name || "—";
  const taxPct = (id?: string) =>
    taxes.find((t) => t.id === id)?.percentage ?? 0;

  // ── Live breakdown preview (centralised calculation layer) ──────────────────
  const preview = useMemo(
    () =>
      computeBreakdown({
        baseAmount: form.total_amount,
        taxPercentage: taxPct(form.tax_id),
        transportFee: form.transport_fee,
        materialFee: form.material_fee,
        seatConfirmation: form.seat_confirmation_amount,
        firstPayment: form.first_payment_amount,
        installmentCount: parseInt(form.installment_count) || 0,
      }),
    [form, taxes],
  );

  const rowBreakdown = (s: FeeStructure) =>
    computeBreakdown({
      baseAmount: s.totalAmount,
      taxPercentage: taxPct(s.taxId),
      transportFee: s.transportFee,
      materialFee: s.materialFee,
      seatConfirmation: s.seatConfirmationAmount,
      firstPayment: s.firstPaymentAmount,
      installmentCount: s.installmentCount,
    });

  const openAdd = () => {
    setEditing(null);
    setForm({
      ...blankForm,
      course_type_id: courseTypes[0]?.id || "",
      standard_id: standards[0]?.id || "",
      academic_year_id: years[0]?.id || "",
    });
    setDialogOpen(true);
  };

  const openEdit = (s: FeeStructure) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description || "",
      course_type_id: s.courseTypeId || "",
      standard_id: s.standardId || "",
      academic_year_id: s.academicYearId || "",
      tax_id: s.taxId || "",
      batch_id: s.batchId || "",
      fee_type: s.feeType,
      total_amount: String(s.totalAmount || ""),
      seat_confirmation_amount: String(s.seatConfirmationAmount || ""),
      first_payment_amount: String(s.firstPaymentAmount || ""),
      installment_count: String(s.installmentCount || "2"),
      transport_fee: String(s.transportFee || ""),
      material_fee: String(s.materialFee || ""),
      recurring_interval: s.recurringInterval || "monthly",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Structure name is required");
    if (!form.total_amount || parseFloat(form.total_amount) <= 0)
      return toast.error("Base amount must be greater than 0");

    const input: FeeStructureInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      courseTypeId: form.course_type_id || null,
      standardId: form.standard_id || null,
      academicYearId: form.academic_year_id || null,
      taxId: form.tax_id || null,
      batchId: form.batch_id || null,
      feeType: form.fee_type,
      totalAmount: parseFloat(form.total_amount),
      seatConfirmationAmount: parseFloat(form.seat_confirmation_amount) || 0,
      firstPaymentAmount: parseFloat(form.first_payment_amount) || 0,
      installmentCount: parseInt(form.installment_count) || 2,
      transportFee: parseFloat(form.transport_fee) || 0,
      materialFee: parseFloat(form.material_fee) || 0,
      recurringInterval:
        form.fee_type === "recurring"
          ? (form.recurring_interval as FeeStructureInput["recurringInterval"])
          : null,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          input,
          note: "Edited via Fee Structures",
        });
        toast.success("Fee structure updated");
      } else {
        await createMut.mutateAsync(input);
        toast.success("Fee structure created");
      }
      setDialogOpen(false);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      toast.success("Fee structure deleted");
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cannot delete");
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
            Fee Structures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fee templates with installment plans, used at student admission.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAutoAssignOpen(true)}
            className="gap-2 border-accent/40 text-accent hover:bg-accent/10"
            disabled={!canDo("fee.edit")}
            title={
              canDo("fee.edit")
                ? "Match every student to the fee structure for their class"
                : "You do not have permission to assign fees"
            }
          >
            <Wand2 className="w-4 h-4" /> Auto-Assign by Class
          </Button>
          <Button
            onClick={openAdd}
            className="gap-2"
            disabled={!canDo("fee.structure.create")}
            title={
              canDo("fee.structure.create")
                ? undefined
                : "You do not have permission to create fee structures"
            }
          >
            <Plus className="w-4 h-4" /> Create Fee Structure
          </Button>
        </div>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Structure Name</th>
                <th className="px-5 py-3 font-medium">Academic Year</th>
                <th className="px-5 py-3 font-medium">Standard</th>
                <th className="px-5 py-3 font-medium">Gross Fee</th>
                <th className="px-5 py-3 font-medium">Seat Conf.</th>
                <th className="px-5 py-3 font-medium">1st Payment</th>
                <th className="px-5 py-3 font-medium">Installments</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && structures.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    No fee structures yet. Create one to use in admission.
                  </td>
                </tr>
              )}
              {structures.map((s) => {
                const b = rowBreakdown(s);
                return (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">
                      {s.name}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {s.feeType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {getName(years, s.academicYearId)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {getName(standards, s.standardId)}
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {formatINR(b.grossTotal)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatINR(s.seatConfirmationAmount)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatINR(s.firstPaymentAmount)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="text-xs">{b.installmentCount}×</span>{" "}
                      {formatINR(b.perInstallment)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs border-accent/40 text-accent hover:bg-accent/10"
                          disabled={!canDo("fee.edit")}
                          title={
                            canDo("fee.edit")
                              ? "Generate fee records for students"
                              : "You do not have permission to assign fees"
                          }
                          onClick={() => setAssignOf(s)}
                        >
                          <Users className="w-3 h-3" /> Assign
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => setHistoryOf(s)}
                        >
                          <History className="w-3 h-3" /> History
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          disabled={!canDo("fee.structure.edit")}
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                          disabled={!canDo("fee.structure.delete")}
                          onClick={() => setPendingDelete(s.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee Structure?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the fee structure. Students already
              linked keep their fee records (the link is simply cleared).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign structure to students */}
      <AssignFeeDialog
        structure={assignOf}
        standards={standards}
        onOpenChange={(open) => !open && setAssignOf(null)}
      />

      {/* Auto-assign fees by class */}
      <AutoAssignFeesDialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen} />

      {/* Revision history */}
      <RevisionHistoryDialog
        structureId={historyOf?.id ?? null}
        structureName={historyOf?.name}
        onOpenChange={(open) => !open && setHistoryOf(null)}
      />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Fee Structure" : "Create Fee Structure"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Structure Name *</label>
              <Input
                placeholder="e.g. Regular 2025 – Grade 10"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional note about this structure"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Academic Year</label>
                <select
                  value={form.academic_year_id}
                  onChange={(e) => set({ academic_year_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- Select Year --</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Standard</label>
                <select
                  value={form.standard_id}
                  onChange={(e) => set({ standard_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- Select Standard --</option>
                  {standards.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fee Type</label>
                <select
                  value={form.fee_type}
                  onChange={(e) =>
                    set({ fee_type: e.target.value as FeeType })
                  }
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {FEE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.fee_type === "recurring" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Recurring Every</label>
                  <select
                    value={form.recurring_interval}
                    onChange={(e) =>
                      set({ recurring_interval: e.target.value })
                    }
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Linked Batch</label>
                  <select
                    value={form.batch_id}
                    onChange={(e) => set({ batch_id: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">-- None --</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Course Type</label>
                <select
                  value={form.course_type_id}
                  onChange={(e) => set({ course_type_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- Select Type --</option>
                  {courseTypes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apply Tax</label>
                <select
                  value={form.tax_id}
                  onChange={(e) => set({ tax_id: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">No Tax</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.percentage}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Percent className="w-3 h-3" /> Payment Schedule
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base Amount (₹) *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 60000"
                    value={form.total_amount}
                    onChange={(e) => set({ total_amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Seat Confirmation (₹)
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g. 5000"
                    value={form.seat_confirmation_amount}
                    onChange={(e) =>
                      set({ seat_confirmation_amount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Transport Fee (₹)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.transport_fee}
                    onChange={(e) => set({ transport_fee: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Material Fee (₹)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.material_fee}
                    onChange={(e) => set({ material_fee: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">First Payment (₹)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 16500"
                    value={form.first_payment_amount}
                    onChange={(e) =>
                      set({ first_payment_amount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    No. of Installments
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={form.installment_count}
                    onChange={(e) =>
                      set({ installment_count: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Live breakdown preview */}
            {preview.base > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-accent" /> Payment Breakdown
                  Preview
                </p>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Base Amount</span>
                    <span className="font-medium text-foreground">
                      {formatINR(preview.base)}
                    </span>
                  </div>
                  {preview.tax > 0 && (
                    <div className="flex justify-between">
                      <span>Tax</span>
                      <span>+ {formatINR(preview.tax)}</span>
                    </div>
                  )}
                  {preview.transportFee > 0 && (
                    <div className="flex justify-between">
                      <span>Transport Fee</span>
                      <span>+ {formatINR(preview.transportFee)}</span>
                    </div>
                  )}
                  {preview.materialFee > 0 && (
                    <div className="flex justify-between">
                      <span>Material Fee</span>
                      <span>+ {formatINR(preview.materialFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-foreground border-t border-border/40 pt-1 mt-1">
                    <span>Gross Total</span>
                    <span>{formatINR(preview.grossTotal)}</span>
                  </div>
                  {preview.seatConfirmation > 0 && (
                    <div className="flex justify-between">
                      <span>Step 1 — Seat Confirmation</span>
                      <span className="text-green-600">
                        {formatINR(preview.seatConfirmation)}
                      </span>
                    </div>
                  )}
                  {preview.firstPayment > 0 && (
                    <div className="flex justify-between">
                      <span>Step 2 — First Payment</span>
                      <span className="text-green-600">
                        {formatINR(preview.firstPayment)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-1 mt-1">
                    <span>
                      Step 3 — Balance ({preview.installmentCount} installments)
                    </span>
                    <span>{formatINR(preview.installmentBalance)}</span>
                  </div>
                  {preview.perInstallment > 0 && (
                    <div className="flex justify-between pl-4 text-xs">
                      <span>Each installment</span>
                      <span>≈ {formatINR(preview.perInstallment)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving
                ? "Saving…"
                : editing
                  ? "Save Changes"
                  : "Create Fee Structure"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeeStructurePage;
