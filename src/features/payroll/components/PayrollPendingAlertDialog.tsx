import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatINR } from "../utils/payrollCalc";
import type { PendingPayrollAlert } from "../types/payroll.types";

// HIGH-PRIORITY monthly popup. It cannot be dismissed by clicking outside or
// pressing Escape — the primary action is "Review Payroll", which takes
// Management to the Approval Center. A close (X) button lets the approver
// dismiss the popup for now; the persistent dashboard card stays, and the popup
// reappears next session until the run is approved + locked.

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-lg font-bold">{value}</div>
  </div>
);

export const PayrollPendingAlertDialog = ({
  alert,
  reviewPath,
  open,
  onClose,
}: {
  alert: PendingPayrollAlert;
  reviewPath: string;
  open: boolean;
  onClose?: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <Wallet className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">💰 Monthly Payroll Pending</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Payroll for <strong>{alert.monthLabel}</strong> has not yet been approved.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Staff Members" value={String(alert.staffCount)} />
            <Stat label="Estimated Payroll" value={formatINR(alert.estimatedTotal)} />
          </div>
          <div className="text-xs text-muted-foreground">
            Last approval: {fmtDate(alert.lastApprovalDate)}
          </div>

          <Button className="w-full" size="lg" onClick={() => navigate(reviewPath)}>
            <Wallet className="mr-2 h-4 w-4" /> Review Payroll
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
