import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions/usePermissions";
import { usePendingMonthlyPayroll } from "../hooks/usePayrollApproval";
import { PayrollPendingCard } from "./PayrollPendingCard";
import { PayrollPendingAlertDialog } from "./PayrollPendingAlertDialog";

// Mounted on the Management dashboard. When the current month's payroll has been
// generated but not yet approved+locked, it renders BOTH the high-priority
// non-dismissable popup and the persistent dashboard warning card. Only
// Management / Admin (the payroll approvers) ever see it.

export const PayrollPendingAlertGate = () => {
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const canSee = hasRole(["management", "admin"]);
  const { data: alert } = usePendingMonthlyPayroll(canSee);

  if (!canSee || !alert) return null;

  const base = user?.role === "admin" ? "admin" : "management";
  const reviewPath = `/${base}/payroll/approval`;

  return (
    <>
      <PayrollPendingCard alert={alert} reviewPath={reviewPath} />
      <PayrollPendingAlertDialog alert={alert} reviewPath={reviewPath} open />
    </>
  );
};
