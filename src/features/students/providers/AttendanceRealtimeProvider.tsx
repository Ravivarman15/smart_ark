// ──────────────────────────────────────────────────────────────────────────────
// AttendanceRealtimeProvider — single Supabase realtime channel that keeps
// student attendance live across tabs / clients.
//
// Watches: student_attendance, student_attendance_audit.
// On any change, invalidates the React Query namespaces that drive the
// marking grid, analytics, reports and the dashboards.
//
// Migration-safe — postgres_changes silently never fires when the tables
// aren't in `supabase_realtime` (the publication ADD happens at the bottom
// of 20260528_attendance_enterprise.sql).
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

const TABLES = ["student_attendance", "student_attendance_audit"] as const;

export const AttendanceRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("attendance-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onChange(table, payload),
      );
    }
    channel.subscribe();

    function onChange(table: string, payload: Payload) {
      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      const batchId = (row.batch_id as string | undefined) ?? undefined;
      const date = (row.attendance_date as string | undefined) ??
        (row.date as string | undefined);
      const studentId = (row.student_id as string | undefined) ?? undefined;

      // Always bust the broad namespaces — cheap, and ensures
      // any list/aggregate view that doesn't key on (batch, date) refetches.
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      qc.invalidateQueries({ queryKey: queryKeys.attendance.all });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.attendance("batch") });

      if (batchId && date) {
        qc.invalidateQueries({
          queryKey: queryKeys.students.attendanceDay(batchId, date),
        });
      }
      if (studentId) {
        qc.invalidateQueries({
          queryKey: queryKeys.students.attendanceHistory(studentId),
        });
      }
      if (date) {
        qc.invalidateQueries({ queryKey: queryKeys.students.attendanceAbsent(date) });
      }
      // Audit timeline cache — bust the whole namespace, filters are too
      // varied to target precisely.
      qc.invalidateQueries({
        queryKey: [...queryKeys.students.all, "attendance-audit"] as const,
      });
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
