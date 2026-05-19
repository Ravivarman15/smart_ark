import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { admissionsService } from "../services/admissions.service";
import type {
  ApproveAdmissionInput,
  ApproveAdmissionResult,
} from "../types/enquiry.types";

/**
 * Approve admission — cross-domain mutation. Invalidates THREE feature caches:
 *   - enquiries (status flipped to converted)
 *   - students  (a new student row exists)
 *   - fees      (a fee record may have been created)
 *
 * Not optimistic: the operation produces server-generated ids that the
 * UI needs (studentId, feeId) — faking those would be wrong.
 */
export const useApproveAdmission = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation<ApproveAdmissionResult, Error, ApproveAdmissionInput>({
    mutationFn: (input) =>
      admissionsService.approve(input, { name: user?.name, profileId: user?.profileId }),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.enquiries.all });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.fees.all });
    },
  });
};
