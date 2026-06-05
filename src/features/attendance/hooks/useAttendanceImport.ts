import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { parseSpreadsheet } from "@/features/students";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceImportService } from "../services";
import { DEFAULT_SETTINGS } from "../utils/workHours";
import { useMarker } from "./useMarker";
import { useAttendanceSettings } from "./useAttendanceSettings";
import type { ImportPreview, ImportPreviewRow } from "../utils/importMapping";

const bustCaches = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
  qc.invalidateQueries({ queryKey: queryKeys.students.all });
  qc.invalidateQueries({ queryKey: queryKeys.staff.all });
  qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  qc.invalidateQueries({ queryKey: ["reports"] });
};

// ── Student import ───────────────────────────────────────────────────────────
export const useStudentImportPreview = () =>
  useMutation<ImportPreview, Error, File>({
    mutationFn: async (file) => {
      const matrix = await parseSpreadsheet(file);
      return attendanceImportService.previewStudent(matrix);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not read file"),
  });

export const useCommitStudentImport = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  return useMutation({
    mutationFn: (rows: ImportPreviewRow[]) => attendanceImportService.commitStudent(rows, marker),
    onSuccess: (res) => {
      bustCaches(qc);
      toast.success(`Imported ${res.success} records${res.errors ? `, ${res.errors} failed` : ""}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });
};

// ── Staff import ─────────────────────────────────────────────────────────────
export const useStaffImportPreview = () => {
  const { data: settings } = useAttendanceSettings();
  return useMutation<ImportPreview, Error, File>({
    mutationFn: async (file) => {
      const matrix = await parseSpreadsheet(file);
      return attendanceImportService.previewStaff(matrix, settings ?? DEFAULT_SETTINGS);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not read file"),
  });
};

export const useCommitStaffImport = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const { data: settings } = useAttendanceSettings();
  return useMutation({
    mutationFn: (rows: ImportPreviewRow[]) =>
      attendanceImportService.commitStaff(rows, settings ?? DEFAULT_SETTINGS, marker),
    onSuccess: (res) => {
      bustCaches(qc);
      toast.success(`Imported ${res.success} records${res.errors ? `, ${res.errors} failed` : ""}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });
};
