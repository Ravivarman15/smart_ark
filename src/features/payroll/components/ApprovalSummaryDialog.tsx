import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Mail, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useApproveAndLock } from "../hooks/usePayrollApproval";
import { formatINR } from "../utils/payrollCalc";
import type { ApprovalSummary, PayrollRun } from "../types/payroll.types";

// Two-step approval gate: REVIEW (the summary figures + anomaly warning) →
// CONFIRM (the final "this will generate slips, lock, email" sign-off). Kept in
// one dialog so we never stack modals. Approving triggers the lock + payslip
// emails via useApproveAndLock.

const monthOf = (run: PayrollRun): string => {
  const d = new Date(`${run.periodStart}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? run.title
    : d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const SummaryStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-muted/30 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-base font-semibold text-foreground">{value}</div>
  </div>
);

export const ApprovalSummaryDialog = ({
  run,
  summary,
  anomalyCount,
  open,
  onOpenChange,
}: {
  run: PayrollRun;
  summary?: ApprovalSummary;
  anomalyCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [step, setStep] = useState<"review" | "confirm">("review");
  const approve = useApproveAndLock();
  const month = monthOf(run);

  const close = () => {
    onOpenChange(false);
    setStep("review");
  };

  const onApprove = async () => {
    try {
      const res = await approve.mutateAsync({ runId: run.id, month });
      const sent = res.emails.filter((e) => e.status === "sent").length;
      toast.success(
        `Payroll approved & locked. ${sent}/${res.emails.length} payslip email(s) sent.`,
      );
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-w-lg">
        {step === "review" ? (
          <>
            <DialogHeader>
              <DialogTitle>Approval Summary — {month}</DialogTitle>
              <DialogDescription>
                Review the totals before approving. {run.periodStart} → {run.periodEnd}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2">
              <SummaryStat label="Employees" value={String(summary?.employees ?? run.staffCount)} />
              <SummaryStat label="Total Payroll" value={formatINR(summary?.totalPayroll ?? run.totalNet)} />
              <SummaryStat label="Bonuses" value={formatINR(summary?.totalBonuses ?? 0)} />
              <SummaryStat label="Deductions" value={formatINR(summary?.totalDeductions ?? run.totalDeductions)} />
              <SummaryStat label="Average Salary" value={formatINR(summary?.averageSalary ?? 0)} />
              <SummaryStat label="Highest" value={formatINR(summary?.highestSalary ?? 0)} />
              <SummaryStat label="Lowest" value={formatINR(summary?.lowestSalary ?? 0)} />
            </div>

            {anomalyCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {anomalyCount} line(s) have anomaly warnings. Review them before approving — once
                  approved, payroll is locked.
                </span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => setStep("confirm")}>Continue to Approve</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" /> Approve Payroll
              </DialogTitle>
              <DialogDescription>This action locks the payroll for {month}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Month</span>
                <span className="font-medium">{month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employees</span>
                <span className="font-medium">{summary?.employees ?? run.staffCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatINR(summary?.totalPayroll ?? run.totalNet)}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <p className="font-medium">This will:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2"><FileText className="h-4 w-4" /> Generate all salary slips</li>
                <li className="flex items-center gap-2"><Lock className="h-4 w-4" /> Lock payroll from further edits</li>
                <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email every employee their payslip</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Record audit logs</li>
              </ul>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("review")} disabled={approve.isPending}>
                Back
              </Button>
              <Button onClick={onApprove} disabled={approve.isPending}>
                {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve Payroll
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
