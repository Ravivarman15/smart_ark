import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";

/**
 * Hard-delete mutation. Removes the student row permanently — linked records
 * (attendance / fees / exams / documents) are cascaded by the FK actions
 * applied in 20260611_students_delete_cascade.sql. If that migration hasn't
 * been applied yet, the service throws a clear validation error which we
 * surface via toast (no app crash).
 */
export const useDeleteStudent = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => studentsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Student permanently deleted");
    },
    onError: (err) => toast.error(err.message),
  });
};
