import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";

/** Soft-delete mutation. List queries are invalidated so the row disappears. */
export const useDeactivateStudent = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => studentsService.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all }),
  });
};
