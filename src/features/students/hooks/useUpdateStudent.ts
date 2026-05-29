import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";
import { STUDENT_MIGRATION_WARNING } from "../utils/constants";
import type { Student, UpdateStudentInput } from "../types/student.types";

interface Args {
  id: string;
  updates: UpdateStudentInput;
}

/**
 * Update mutation with optimistic apply. The list/detail caches are
 * patched immediately; on error we roll back. This is what gives an
 * ERP table its "instant" feel without losing correctness.
 */
export const useUpdateStudent = () => {
  const qc = useQueryClient();

  return useMutation<void, Error, Args, { prevDetail?: Student }>({
    mutationFn: ({ id, updates }) =>
      studentsService.update(id, updates, {
        onColumnsDropped: (cols) =>
          toast.warning(`${STUDENT_MIGRATION_WARNING}: ${cols.join(", ")}`),
      }),

    onMutate: async ({ id, updates }) => {
      await qc.cancelQueries({ queryKey: queryKeys.students.detail(id) });
      const prevDetail = qc.getQueryData<Student>(queryKeys.students.detail(id));
      if (prevDetail) {
        qc.setQueryData<Student>(queryKeys.students.detail(id), { ...prevDetail, ...updates });
      }
      return { prevDetail };
    },

    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(queryKeys.students.detail(id), ctx.prevDetail);
    },

    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
};
