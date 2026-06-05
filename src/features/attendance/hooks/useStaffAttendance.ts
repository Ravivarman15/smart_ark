import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { staffAttendanceService } from "../services";
import { DEFAULT_SETTINGS } from "../utils/workHours";
import { useMarker } from "./useMarker";
import { useAttendanceSettings } from "./useAttendanceSettings";
import type { StaffManualInput } from "../types/attendance.types";

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
  qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  qc.invalidateQueries({ queryKey: ["reports"] });
};

// ── Reads ──────────────────────────────────────────────────────────────────
export const useStaffAttendanceDay = (date: string) =>
  useQuery({
    queryKey: queryKeys.attendance.staffDay(date),
    queryFn: () => staffAttendanceService.getDay(date),
  });

export const useStaffMemberDay = (staffId: string | undefined, date: string) =>
  useQuery({
    queryKey: queryKeys.attendance.staffMember(staffId ?? "noop", date, date),
    queryFn: () => staffAttendanceService.getMemberDay(staffId as string, date),
    enabled: !!staffId,
  });

export const useStaffMemberRange = (staffId: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: queryKeys.attendance.staffMember(staffId ?? "noop", from, to),
    queryFn: () => staffAttendanceService.memberRange(staffId as string, from, to),
    enabled: !!staffId,
  });

export const useStaffRange = (from: string, to: string, staffId?: string) =>
  useQuery({
    queryKey: queryKeys.attendance.staffRange(from, to, staffId),
    queryFn: () => staffAttendanceService.range(from, to, staffId),
  });

export const useStaffAttendanceAudit = (filters: {
  staffId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: queryKeys.attendance.staffAudit(filters as Record<string, unknown>),
    queryFn: () => staffAttendanceService.auditTimeline(filters),
  });

// ── Writes ─────────────────────────────────────────────────────────────────
export const useSaveStaffManual = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const { data: settings } = useAttendanceSettings();
  return useMutation({
    mutationFn: (input: StaffManualInput) =>
      staffAttendanceService.saveManual(input, marker, settings ?? DEFAULT_SETTINGS),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Staff attendance saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};

export const useStaffCheckIn = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const { data: settings } = useAttendanceSettings();
  return useMutation({
    mutationFn: ({ staffId, date }: { staffId: string; date: string }) =>
      staffAttendanceService.checkIn(staffId, date, marker, settings ?? DEFAULT_SETTINGS),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Checked in");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Check-in failed"),
  });
};

export const useStaffCheckOut = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const { data: settings } = useAttendanceSettings();
  return useMutation({
    mutationFn: ({ staffId, date }: { staffId: string; date: string }) =>
      staffAttendanceService.checkOut(staffId, date, marker, settings ?? DEFAULT_SETTINGS),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Checked out");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Check-out failed"),
  });
};

export const useStaffCorrection = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const { data: settings } = useAttendanceSettings();
  return useMutation({
    mutationFn: ({ input, reason }: { input: StaffManualInput; reason: string }) =>
      staffAttendanceService.correct(input, reason, marker, settings ?? DEFAULT_SETTINGS),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success("Correction recorded");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Correction failed"),
  });
};
