import { useNavigate } from "react-router-dom";
import { Wallet, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "../utils/payrollCalc";
import type { PendingPayrollAlert } from "../types/payroll.types";

// Dashboard warning card surfaced while the current month's payroll is awaiting
// approval. Mirrors the popup figures; stays until the run is approved + locked.

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export const PayrollPendingCard = ({
  alert,
  reviewPath,
}: {
  alert: PendingPayrollAlert;
  reviewPath: string;
}) => {
  const navigate = useNavigate();
  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              Monthly Payroll Pending — {alert.monthLabel}
            </div>
            <div className="text-sm text-amber-800/90 dark:text-amber-300/90">
              {alert.staffCount} staff · Estimated {formatINR(alert.estimatedTotal)} · Last approval{" "}
              {fmtDate(alert.lastApprovalDate)}
            </div>
          </div>
        </div>
        <Button onClick={() => navigate(reviewPath)} className="shrink-0">
          <Wallet className="mr-2 h-4 w-4" /> Review Payroll
        </Button>
      </CardContent>
    </Card>
  );
};
