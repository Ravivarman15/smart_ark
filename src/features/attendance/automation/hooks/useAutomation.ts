import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { useMarker } from "../../hooks/useMarker";
import { alertsService, automationService } from "../services";
import type { AlertCategory, AlertStatus, AttendanceAlert } from "../types/automation.types";

const onErr = (err: unknown) => toast.error(err instanceof Error ? err.message : "Action failed");

// ── Alerts ────────────────────────────────────────────────────────────────────
export const useAttendanceAlerts = (filters: { category?: AlertCategory | "all"; status?: AlertStatus | "all" } = {}) =>
  useQuery({
    queryKey: queryKeys.attendance.alerts(filters),
    queryFn: () => alertsService.list(filters),
  });

export const useAlertMutations = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  const bust = () => qc.invalidateQueries({ queryKey: queryKeys.attendance.all });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: AlertStatus }) => alertsService.setStatus(v.id, v.status, marker),
    onSuccess: (_d, v) => {
      bust();
      toast.success(`Alert ${v.status}`);
    },
    onError: onErr,
  });

  const notify = useMutation({
    mutationFn: (v: { alerts: AttendanceAlert[]; branchName?: string }) =>
      automationService.notify(v.alerts, { branchName: v.branchName }, marker),
    onSuccess: (res) => {
      bust();
      if (res.queued > 0) toast.success(`${res.queued} WhatsApp alert(s) queued`);
      else toast.message("Nothing queued — WhatsApp outbox unavailable or no eligible alerts");
    },
    onError: onErr,
  });

  return { setStatus, notify };
};

// ── Scans / runs ────────────────────────────────────────────────────────────────
export const useAutomationRuns = () =>
  useQuery({ queryKey: queryKeys.attendance.automationRuns(), queryFn: () => automationService.listRuns() });

export const useRunScan = () => {
  const qc = useQueryClient();
  const marker = useMarker();
  return useMutation({
    mutationFn: (job: "student" | "staff" | "missing_checkout" | "all") => {
      if (job === "student") return automationService.runStudentScan(marker).then((r) => [r]);
      if (job === "staff") return automationService.runStaffScan(marker).then((r) => [r]);
      if (job === "missing_checkout") return automationService.runMissingCheckoutScan(marker).then((r) => [r]);
      return automationService.runAll(marker);
    },
    onSuccess: (summaries) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      const created = summaries.reduce((a, s) => a + s.created, 0);
      toast.success(`Scan complete — ${created} new alert(s)`);
    },
    onError: onErr,
  });
};
