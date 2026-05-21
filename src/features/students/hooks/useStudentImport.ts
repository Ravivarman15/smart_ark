import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { importService } from "../services/import.service";
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
    mutationFn: ({ rows, fileName }: { rows: StudentWriteInput[]; fileName: string }) =>
      importService.commit(rows, fileName, user?.profileId),
    onSuccess: (batch) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success(
        `Imported ${batch.successRows}/${batch.totalRows} students` +
          (batch.errorRows ? ` · ${batch.errorRows} failed` : "")
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });
};
