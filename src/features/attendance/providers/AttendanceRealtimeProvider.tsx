// ──────────────────────────────────────────────────────────────────────────────
// AttendanceRealtimeProvider — one Supabase realtime channel that keeps the
// enterprise attendance module live across tabs / clients.
//
// Watches: student_attendance(+audit), staff_attendance(+audit), attendance_settings.
// On any change, invalidates the React Query namespaces that drive the marking
// grids, registers, work-hours, dashboard, analytics and reports.
//
// Migration-safe — postgres_changes simply never fires for tables that aren't in
// the `supabase_realtime` publication yet (the ADDs happen at the bottom of
// 20260528_attendance_enterprise.sql and 20260612_attendance_module.sql).
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

const TABLES = [
  "student_attendance",
  "student_attendance_audit",
  "staff_attendance",
  "staff_attendance_audit",
  "attendance_settings",
  // Phase 5 — governance & automation
  "attendance_locks",
  "attendance_closings",
  "attendance_approvals",
  "attendance_alerts",
  "attendance_automation_runs",
  "attendance_governance_audit",
] as const;

export const AttendanceRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("attendance-module-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => {
          // Filters are too varied to target precisely — bust the broad
          // namespaces (cheap) so every dependent view refetches.
          qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
          qc.invalidateQueries({ queryKey: queryKeys.students.all });
          qc.invalidateQueries({ queryKey: queryKeys.staff.all });
          qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
          qc.invalidateQueries({ queryKey: ["reports"] });
        },
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
