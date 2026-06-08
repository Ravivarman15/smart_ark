import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { payrollAnalyticsService, payrollAuditService } from "../services";
import type { PayrollAuditEntityType } from "../types/payroll.types";

// Read-only hooks for the Payroll Dashboard, Analytics and Audit Center.

export const usePayrollOverview = () =>
  useQuery({
    queryKey: queryKeys.payroll.overview(),
    queryFn: () => payrollAnalyticsService.overview(),
  });

export const usePayrollAnalytics = () =>
  useQuery({
    queryKey: queryKeys.payroll.analytics("full"),
    queryFn: () => payrollAnalyticsService.analytics(),
  });

export const usePayrollAudit = (
  entityType: PayrollAuditEntityType | "all",
  entityId?: string,
) =>
  useQuery({
    queryKey: queryKeys.payroll.audit(entityType, entityId),
    queryFn: () =>
      entityType === "all"
        ? payrollAuditService.recent()
        : payrollAuditService.list(entityType, entityId),
  });
