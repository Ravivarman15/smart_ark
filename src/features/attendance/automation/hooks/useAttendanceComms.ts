// Attendance Communication — dashboard + report data hooks.
//
// Realtime: message_queue is in the `supabase_realtime` publication (see
// 20260714_attendance_whatsapp.sql), so every finalised send pushes a change and
// the counters move on their own. The refetchInterval is a safety net for
// installs where the publication isn't there.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attendanceCommsService } from "../services";

/** Namespace busted by the save mutation and the realtime subscription. */
export const attendanceCommsKeys = {
  all: ["attendance-comms"] as const,
  stats: (date: string) => ["attendance-comms", "stats", date] as const,
  list: (from: string, to: string) => ["attendance-comms", "list", from, to] as const,
};

/** Live-subscribe to the ledger so the dashboard updates as sends finalise. */
export const useAttendanceCommsRealtime = (): void => {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("attendance-comms-sync")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "message_queue" } as never,
        () => qc.invalidateQueries({ queryKey: attendanceCommsKeys.all }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
};

export const useAttendanceCommsStats = (date: string) =>
  useQuery({
    queryKey: attendanceCommsKeys.stats(date),
    queryFn: () => attendanceCommsService.stats(date),
    refetchInterval: 30_000,
  });

export const useAttendanceNotices = (from: string, to: string) =>
  useQuery({
    queryKey: attendanceCommsKeys.list(from, to),
    queryFn: () => attendanceCommsService.list({ from, to }),
    refetchInterval: 30_000,
  });
