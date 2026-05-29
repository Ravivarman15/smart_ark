import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";
import { STUDENT_MIGRATION_WARNING } from "../utils/constants";
import type { CreateStudentInput, Student } from "../types/student.types";

/**
 * Create-student mutation. On success, invalidates all student lists so
 * any open table re-fetches the next page (cache-driven UI consistency).
 * If the schema is mid-migration, the row still saves with whatever columns
 * exist and the operator is warned which fields were skipped.
 */
export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation<Student, Error, CreateStudentInput>({
    mutationFn: (input) =>
      studentsService.create(input, {
        onColumnsDropped: (cols) =>
          toast.warning(`${STUDENT_MIGRATION_WARNING}: ${cols.join(", ")}`),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
};
