import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { leaveImpactService, timetableLockService } from "../services";
import { payrollValidationService } from "@/features/payroll/services/payrollValidation.service";

/** Classes needing coverage because their teacher is on/requesting leave. */
export const useLeaveImpact = (from: string, to: string, teacherId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.leaveImpact(from, to, teacherId),
    queryFn: () => leaveImpactService.affectedClasses(from, to, { teacherId }),
  });

/** Active timetable locks (management). */
export const useTimetableLocks = () =>
  useQuery({
    queryKey: queryKeys.allocation.timetableLocks(),
    queryFn: () => timetableLockService.list(true),
  });

export const useTimetableLockMutations = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
  const lock = useMutation({
    mutationFn: (v: { periodStart: string; periodEnd: string; reason?: string }) =>
      timetableLockService.lock(v.periodStart, v.periodEnd, {
        reason: v.reason,
        lockedBy: user?.profileId,
      }),
    onSuccess: invalidate,
  });
  const unlock = useMutation({
    mutationFn: (id: string) => timetableLockService.unlock(id),
    onSuccess: invalidate,
  });
  return { lock, unlock };
};

/** Payroll pre-generation discrepancies for a period. */
export const usePayrollValidation = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.allocation.payrollValidation(from, to),
    queryFn: () => payrollValidationService.buildDiscrepancy(from, to),
    enabled,
  });
