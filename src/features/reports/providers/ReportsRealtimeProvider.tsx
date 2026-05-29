// ──────────────────────────────────────────────────────────────────────────────
// ReportsRealtimeProvider — single Supabase realtime channel that keeps the
// Reports & Analytics module live for the data sources NOT already covered by
// a feature-owned realtime provider.
//
// The reports module is a composition layer: Finance, Fees, student-Attendance
// and Enquiries each already invalidate `queryKeys.reports.all` from their own
// realtime providers (FinanceRealtimeProvider / FeesRealtimeProvider /
// AttendanceRealtimeProvider / EnquiriesRealtimeProvider). That left four
// report data sources with no realtime channel at all, so their reports only
// refreshed on a hard reload:
//
//   • exams / exam_results / mcq_attempts → Exam Status, Student Exam Summary,
//     Student Performance reports
//   • message_queue                       → SMS Status report
//   • profile_attendance / teacher_attendance → Staff Attendance report
//   • students                            → Student Detail / ID Card / QR Card /
//     Mobile App Status reports
//
// This provider watches exactly those tables and busts the reports tree (plus
// the owning feature namespace so the source feature's own pages stay live).
//
// Migration-safe — postgres_changes silently never fires when a table isn't in
// the `supabase_realtime` publication, so this is a no-op on deployments that
// haven't run 20260606_reports_realtime_publication.sql yet (it can't error,
// it just won't deliver events until the tables are published).
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

interface Payload {
  table: string;
  schema: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

// Tables whose changes feed a report but that no other realtime provider
// already watches. `teacher_attendance` is the legacy staff-attendance table
// (already in the base publication); `profile_attendance` is its successor.
const TABLES = [
  "exams",
  "exam_results",
  "mcq_attempts",
  "message_queue",
  "profile_attendance",
  "teacher_attendance",
  "students",
] as const;

export const ReportsRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("reports-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onChange(table, payload),
      );
    }
    channel.subscribe();

    function onChange(table: string, _payload: Payload) {
      // Reports compose every one of these tables — always bust the whole
      // reports tree so KPIs, charts, tables and exports all recompute.
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });

      // Dashboards surface the same aggregates (exam analytics, staff
      // attendance, today's messages) — mirror the other realtime providers
      // and refresh the dashboard namespace too.
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      // Also nudge the owning feature namespace so the source feature's own
      // pages stay live, not just the report views.
      switch (table) {
        case "exams":
        case "exam_results":
        case "mcq_attempts":
          qc.invalidateQueries({ queryKey: queryKeys.exams.all });
          break;
        case "message_queue":
          qc.invalidateQueries({ queryKey: queryKeys.communication.all });
          break;
        case "profile_attendance":
        case "teacher_attendance":
          qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
          break;
        case "students":
          qc.invalidateQueries({ queryKey: queryKeys.students.all });
          break;
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
