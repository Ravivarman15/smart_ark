import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { importService } from "../services/import.service";
import type { CreatedAcademicSummary } from "../services/academicProvision.service";
import { STUDENT_MIGRATION_WARNING } from "../utils/constants";
import type {
  ImportControl,
  ImportRunStats,
  StudentWriteInput,
} from "../types/student.types";

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
      updates,
      fileName,
      onProgress,
      createdAcademic,
      stats,
      control,
    }: {
      rows: StudentWriteInput[];
      /** Matched existing students to patch (incremental — only changed fields). */
      updates?: { id: string; data: Partial<StudentWriteInput> }[];
      fileName: string;
      onProgress?: (done: number, total: number) => void;
      createdAcademic?: CreatedAcademicSummary;
      stats?: ImportRunStats;
      control?: ImportControl;
    }) =>
      importService.commitPlan({ inserts: rows, updates: updates ?? [] }, fileName, {
        importedBy: user?.profileId,
        onProgress,
        createdAcademic,
        stats,
        control,
      }),
    onSuccess: (batch) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.students.importHistory() });
      const verb = batch.status === "cancelled" ? "Cancelled —" : "Imported";
      toast.success(
        `${verb} ${batch.successRows}/${batch.totalRows} students` +
          (batch.updatedRows ? ` · ${batch.updatedRows} updated` : "") +
          (batch.errorRows ? ` · ${batch.errorRows} failed` : "")
      );
      if (batch.droppedColumns?.length) {
        toast.warning(`${STUDENT_MIGRATION_WARNING}: ${batch.droppedColumns.join(", ")}`);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });
};

export const useRollbackImport = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (batchId: string) => importService.rollbackBatch(batchId, user?.profileId),
    onSuccess: ({ deleted }) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.students.importHistory() });
      toast.success(`Rolled back — ${deleted} student${deleted === 1 ? "" : "s"} removed`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Rollback failed"),
  });
};
