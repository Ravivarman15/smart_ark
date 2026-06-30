import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import {
  feeAssignmentService,
  type AssignFeeStructureInput,
  type ClassAssignmentChoice,
} from "../services/feeAssignment.service";

// Hooks for assigning a fee structure to students (generates student_fees rows).

const eligibleKey = (standardId?: string) =>
  [...queryKeys.fees.all, "eligible-students", standardId ?? "all"] as const;

/** Active students eligible for fee assignment, optionally by standard. */
export const useEligibleStudents = (
  params: { standardId?: string },
  enabled: boolean
) =>
  useQuery({
    queryKey: eligibleKey(params.standardId),
    queryFn: () => feeAssignmentService.eligibleStudents(params),
    enabled,
  });

/** Per-class plan for auto-assigning fees by the student's standard. */
export const useClassAssignmentPlan = (enabled: boolean) =>
  useQuery({
    queryKey: [...queryKeys.fees.all, "class-assignment-plan"] as const,
    queryFn: () => feeAssignmentService.classAssignmentPlan(),
    enabled,
  });

/** Assign a fee structure to the chosen students (skips existing records). */
export const useAssignFeeStructure = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: Omit<AssignFeeStructureInput, "createdBy">) =>
      feeAssignmentService.assignStructure({ ...input, createdBy: user?.profileId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.fees.all });
      if (res.created === 0) {
        toast.info(
          res.skipped > 0
            ? "All selected students already have a fee record"
            : "No students assigned"
        );
      } else {
        toast.success(
          `${res.created} fee record${res.created === 1 ? "" : "s"} created` +
            (res.skipped ? ` · ${res.skipped} already had one` : "")
        );
      }
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to assign fee structure"),
  });
};

/** Auto-assign fees to every fee-less student by their class (one click). */
export const useAutoAssignByClass = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (choices: ClassAssignmentChoice[]) =>
      feeAssignmentService.autoAssignByClass({ choices, createdBy: user?.profileId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.fees.all });
      if (res.created === 0) {
        toast.info(
          res.skipped > 0
            ? "All matched students already have a fee record"
            : "No students assigned"
        );
      } else {
        toast.success(
          `${res.created} fee record${res.created === 1 ? "" : "s"} created by class` +
            (res.skipped ? ` · ${res.skipped} already had one` : "")
        );
      }
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Auto-assign failed"),
  });
};
