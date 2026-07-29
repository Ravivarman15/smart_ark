// ──────────────────────────────────────────────────────────────────────────────
// AllocationRealtimeProvider — one Supabase channel that keeps class tracking
// live across portals.
//
// The point: when a teacher presses Start, End or submits attendance, the
// coordinator's and management's screens must change on their own. Before this
// the live board polled once a minute and the Class Scheduling page never
// refreshed at all, so "is anyone actually teaching right now" was answered by
// data up to a minute old — or by whatever was on screen when the page loaded.
//
// Watches: class_schedules (the lifecycle), class_attendance (marks),
// class_students (roster) and class_schedule_audit (who did what).
//
// Migration-safe by construction — postgres_changes simply never fires for a
// table that isn't in the `supabase_realtime` publication.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

const TABLES = [
  "class_schedules",
  "class_attendance",
  "class_students",
  "class_schedule_audit",
] as const;

export const AllocationRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("allocation-module-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => {
          // The board, the schedule list, workload and the teacher's own
          // classes all live under one namespace — busting it is cheaper than
          // trying to work out which view a given row belongs to.
          qc.invalidateQueries({ queryKey: queryKeys.allocation.all });
          // Teaching hours feed the dashboards and the salary projection.
          qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
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

export default AllocationRealtimeProvider;
