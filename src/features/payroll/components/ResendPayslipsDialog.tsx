import { useMemo, useState } from "react";
import { Loader2, Mail, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useResendPayslips } from "../hooks/usePayrollApproval";
import { summarisePayslipDelivery } from "../services/payrollEmail.service";
import { formatINR } from "../utils/payrollCalc";
import type { ApprovalGridRow, PayrollRun } from "../types/payroll.types";

// Resend payslip emails for an already-approved/paid run. The approver chooses
// between ALL employees in the run or a hand-picked SUBSET, then we re-render +
// re-email each selected slip via useResendPayslips. Nothing about the run's
// status / lock / Finance posting changes — this is email + PDF only.

const monthOf = (run: PayrollRun): string => {
  const d = new Date(`${run.periodStart}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? run.title
    : d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

type Mode = "all" | "selected";

export const ResendPayslipsDialog = ({
  run,
  rows,
  open,
  onOpenChange,
}: {
  run: PayrollRun;
  rows: ApprovalGridRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const resend = useResendPayslips();
  const month = monthOf(run);

  const [mode, setMode] = useState<Mode>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.staffName} ${r.employeeCode}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const reset = () => {
    setMode("all");
    setSelected(new Set());
    setSearch("");
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const toggle = (staffId: string) => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(staffId)) nextSet.delete(staffId);
      else nextSet.add(staffId);
      return nextSet;
    });
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.staffId));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => nextSet.delete(r.staffId));
      else filtered.forEach((r) => nextSet.add(r.staffId));
      return nextSet;
    });
  };

  const recipientCount = mode === "all" ? rows.length : selected.size;
  const canSend = recipientCount > 0 && !resend.isPending;

  const onSend = async () => {
    const staffIds = mode === "selected" ? [...selected] : undefined;
    try {
      const emails = await resend.mutateAsync({ runId: run.id, month, staffIds });
      const sent = emails.filter((e) => e.status === "sent").length;
      toast.success(`${sent}/${emails.length} payslip email(s) sent.`);
      const degraded = summarisePayslipDelivery(emails);
      if (degraded) toast.warning(degraded, { duration: 10_000 });
      close(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Resend Payslips — {month}
          </DialogTitle>
          <DialogDescription>
            Re-emails the salary slip with the PDF attached. The run's status,
            lock and Finance posting are unaffected.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
          <div className="flex items-start gap-2">
            <RadioGroupItem value="all" id="resend-all" className="mt-0.5" />
            <Label htmlFor="resend-all" className="cursor-pointer font-normal">
              <span className="font-medium">All employees</span>
              <span className="block text-xs text-muted-foreground">
                Email every employee in this run ({rows.length}).
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="selected" id="resend-selected" className="mt-0.5" />
            <Label htmlFor="resend-selected" className="cursor-pointer font-normal">
              <span className="font-medium">Selected employees</span>
              <span className="block text-xs text-muted-foreground">
                Pick only the employees who should be re-sent.
              </span>
            </Label>
          </div>
        </RadioGroup>

        {mode === "selected" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name / ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={toggleAllFiltered}
                className="font-medium text-primary hover:underline"
                disabled={filtered.length === 0}
              >
                {allFilteredSelected ? "Clear all" : "Select all"}
              </button>
              <span>{selected.size} selected</span>
            </div>

            <ScrollArea className="h-56 rounded-md border">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No employees match your search.
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((r) => (
                    <li key={r.staffId}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                        <Checkbox
                          checked={selected.has(r.staffId)}
                          onCheckedChange={() => toggle(r.staffId)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{r.staffName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {r.employeeCode}
                            {r.designation ? ` · ${r.designation}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-medium text-muted-foreground">
                          {formatINR(r.netSalary)}
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={resend.isPending}>
            Cancel
          </Button>
          <Button onClick={onSend} disabled={!canSend}>
            {resend.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Resend to {recipientCount} {recipientCount === 1 ? "employee" : "employees"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
