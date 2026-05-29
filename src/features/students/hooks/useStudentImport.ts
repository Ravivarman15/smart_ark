import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { importService } from "../services/import.service";
import { STUDENT_MIGRATION_WARNING } from "../utils/constants";
import type { StudentWriteInput } from "../types/student.types";

export const useImportHistory = () =>
  useQuery({
    queryKey: queryKeys.students.importHistory(),
    queryFn: () => importService.history(),
  });

export const useCommitImport = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      rows,
      fileName,
      onProgress,
    }: {
      rows: StudentWriteInput[];
      fileName: string;
      onProgress?: (done: number, total: number) => void;
    }) => importService.commit(rows, fileName, user?.profileId, onProgress),
    onSuccess: (batch) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success(
        `Imported ${batch.successRows}/${batch.totalRows} students` +
          (batch.errorRows ? ` · ${batch.errorRows} failed` : "")
      );
      if (batch.droppedColumns?.length) {
        toast.warning(
          `${STUDENT_MIGRATION_WARNING}: ${batch.droppedColumns.join(", ")}`
        );
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });
};
