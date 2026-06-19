// ──────────────────────────────────────────────────────────────────────────────
// LeadsRealtimeProvider — one Supabase realtime channel keeping the Lead CRM
// live across tabs / clients. Mirrors EnquiriesRealtimeProvider for shape and
// migration-safety (a missing table just yields no events).
//
// Watches the lead funnel tables; on any change invalidates the React Query
// namespaces that drive lead lists/detail, dashboards, notifications and
// reports — so counselor + management dashboards, the pipeline board and the
// notification center update without a refresh.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

interface Payload {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

const TABLES = [
  "leads",
  "lead_followups",
  "lead_notifications",
  "demo_classes",
  "admissions",
] as const;

export const LeadsRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("leads-sync");
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

      // Lead lists + detail + dashboards.
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      // Dashboard tiles + reports aggregate lead/admission data.
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });

      // Notification center — only the recipient's own feed needs a refresh.
      if (payload.table === "lead_notifications") {
        const recipient = row.recipient_id as string | undefined;
        qc.invalidateQueries({ queryKey: queryKeys.leads.notifications(recipient) });
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
