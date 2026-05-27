// ──────────────────────────────────────────────────────────────────────────────
// EnquiriesRealtimeProvider — single Supabase realtime channel keeping the
// admission funnel live across tabs / clients.
//
// Watches: admission_calls.
// On any change, invalidates the React Query namespaces that drive the
// Enquiry Management page, follow-ups, and the dashboard KPIs (today
// enquiries, conversion rate, enquiry funnel widget).
//
// Mirrors AttendanceRealtimeProvider for shape and migration-safety.
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

const TABLES = ["admission_calls"] as const;

export const EnquiriesRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("enquiries-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onChange(payload),
      );
    }
    channel.subscribe();

    function onChange(payload: Payload) {
      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      const id = (row.id as string | undefined) ?? undefined;

      // Enquiry list + detail.
      qc.invalidateQueries({ queryKey: queryKeys.enquiries.all });
      if (id) {
        qc.invalidateQueries({ queryKey: queryKeys.enquiries.detail(id) });
      }

      // Dashboard tiles (today enquiries, conversion %, enquiry funnel).
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      // Reports aggregate enquiry data (admission analysis, inquiry analysis).
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
