import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";
import type { CreateStudentInput, Student } from "../types/student.types";

/**
 * Create-student mutation. On success, invalidates all student lists so
 * any open table re-fetches the next page (cache-driven UI consistency).
 */
export const useCreateStudent = () => {
  const qc = useQueryClient();
  return useMutation<Student, Error, CreateStudentInput>({
    mutationFn: (input) => studentsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
};
