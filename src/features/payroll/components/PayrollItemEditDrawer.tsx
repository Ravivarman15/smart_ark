import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useItemHistory, useUpdateItemBreakdown } from "../hooks/usePayrollApproval";
import { recomputeNet } from "../utils/payrollApprovalCalc";
import { formatINR } from "../utils/payrollCalc";
import type { ApprovalGridRow, ItemComponentPatch } from "../types/payroll.types";

// Side drawer for adjusting one staff member's one-time components before
// approval. Every save requires a reason and is logged field-by-field to the
// salary change history (shown at the bottom). Read-only once payroll is locked.

type FieldKey = keyof Omit<ItemComponentPatch, "adjustments" | "remarks">;

const EARNINGS: { key: FieldKey; label: string }[] = [
  { key: "manualAdjustment", label: "Manual Adjustment (±)" },
  { key: "bonus", label: "Bonus" },
  { key: "incentives", label: "Incentives" },
  { key: "allowances", label: "Allowances" },
  { key: "reimbursements", label: "Reimbursements" },
];

const DEDUCTIONS: { key: FieldKey; label: string }[] = [
  { key: "loanDeduction", label: "Loan Deduction" },
  { key: "pf", label: "PF" },
  { key: "esi", label: "ESI" },
  { key: "tax", label: "Tax" },
  { key: "deductions", label: "Other Deductions" },
  { key: "penalties", label: "Penalties" },
  { key: "otherDeductions", label: "Misc. Deductions" },
];

const ALL_FIELDS = [...EARNINGS, ...DEDUCTIONS];

const initialState = (row: ApprovalGridRow): Record<FieldKey, number> => ({
  incentives: row.incentives,
  allowances: row.allowances,
  bonus: row.bonus,
  reimbursements: row.reimbursements,
  loanDeduction: row.loanDeduction,
  deductions: row.deductions,
  penalties: row.penalties,
  pf: row.pf,
  esi: row.esi,
  tax: row.tax,
  otherDeductions: row.otherDeductions,
  manualAdjustment: row.manualAdjustment,
});

export const PayrollItemEditDrawer = ({
  row,
  locked,
  open,
  onOpenChange,
}: {
  row: ApprovalGridRow | null;
  locked: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [values, setValues] = useState<Record<FieldKey, number>>(
    row ? initialState(row) : ({} as Record<FieldKey, number>),
  );
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("");
  const update = useUpdateItemBreakdown();
  const { data: history = [] } = useItemHistory(open ? row?.id ?? null : null);

  useEffect(() => {
    if (row) {
      setValues(initialState(row));
      setRemarks(row.remarks ?? "");
      setReason("");
    }
  }, [row]);

  const preview = useMemo(() => {
    if (!row) return null;
    return recomputeNet({
      basicSalary: row.basicSalary,
      hourlyEarnings: row.hourlyEarnings,
      overtimeEarnings: row.overtimeEarnings,
      ...values,
    });
  }, [row, values]);

  if (!row) return null;

  const set = (key: FieldKey, raw: string) => {
    const n = parseFloat(raw);
    setValues((v) => ({ ...v, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const onSave = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required to change salary.");
      return;
    }
    const patch: ItemComponentPatch = { ...values, remarks };
    try {
      await update.mutateAsync({ itemId: row.id, patch, reason: reason.trim() });
      toast.success(`Salary updated for ${row.staffName ?? "employee"}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {locked && <Lock className="w-4 h-4 text-muted-foreground" />}
            {row.staffName}
          </SheetTitle>
          <SheetDescription>
            {row.employeeCode} · {row.designation ?? row.role} ·{" "}
            {row.department ?? "—"}
          </SheetDescription>
        </SheetHeader>

        {locked && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Payroll is locked. Unlock it to edit salaries.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 text-xs font-semibold uppercase text-muted-foreground">
            Earnings
          </div>
          {EARNINGS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                disabled={locked}
                value={values[f.key] ?? 0}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="col-span-2 mt-2 text-xs font-semibold uppercase text-muted-foreground">
            Deductions
          </div>
          {DEDUCTIONS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                disabled={locked}
                value={values[f.key] ?? 0}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1">
          <Label className="text-xs">Remarks</Label>
          <Textarea
            disabled={locked}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional note shown on the payslip…"
            rows={2}
          />
        </div>

        {preview && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <div className="text-[11px] uppercase tracking-wide opacity-80">
                Net Salary (preview)
              </div>
              <div className="text-[11px] opacity-80">
                Gross {formatINR(preview.grossEarnings)} − Deductions{" "}
                {formatINR(preview.totalDeductions)}
              </div>
            </div>
            <div className="text-xl font-bold">{formatINR(preview.netSalary)}</div>
          </div>
        )}

        {!locked && (
          <>
            <div className="mt-4 space-y-1">
              <Label className="text-xs">
                Reason for change <span className="text-destructive">*</span>
              </Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Festival bonus approved by Management"
              />
            </div>
            <Button
              className="mt-3 w-full"
              onClick={onSave}
              disabled={update.isPending || !reason.trim()}
            >
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </>
        )}

        <Separator className="my-5" />

        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Salary Change History
        </div>
        <div className="mt-2 space-y-2">
          {history.length === 0 && (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          )}
          {history.map((h) => (
            <div
              key={h.id}
              className="rounded-md border bg-muted/30 px-3 py-2 text-xs"
            >
              <div className="flex justify-between font-medium">
                <span className="capitalize">{h.field.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-muted-foreground">
                {h.oldValue} → <span className="text-foreground">{h.newValue}</span>
                {h.actorName ? ` · ${h.actorName}` : ""}
              </div>
              {h.reason && <div className="italic text-muted-foreground">“{h.reason}”</div>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
