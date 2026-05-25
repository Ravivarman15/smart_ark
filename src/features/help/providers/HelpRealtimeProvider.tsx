// ──────────────────────────────────────────────────────────────────────────────
// HelpRealtimeProvider — single Supabase realtime channel that keeps the
// help & support module live.
//
// Watches: support_tickets, support_ticket_messages, support_ticket_attachments,
//          support_feedback, support_feedback_votes.
// On any change, invalidates the matching React Query namespace so any
// component subscribed via useTickets/useTicket/useTicketMessages/etc. refetches.
//
// Migration-safe — the channel binds to tables that may not exist yet; the
// postgres_changes filter simply never fires until the help migration is run.
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

const TABLES = [
  "support_tickets",
  "support_ticket_messages",
  "support_ticket_attachments",
  "support_feedback",
  "support_feedback_votes",
] as const;

export const HelpRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("help-sync");

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
      const ticketId = (row.ticket_id as string | undefined) ??
        (table === "support_tickets" ? (row.id as string | undefined) : undefined);
      const feedbackId = (row.feedback_id as string | undefined) ??
        (table === "support_feedback" ? (row.id as string | undefined) : undefined);

      switch (table) {
        case "support_tickets":
          qc.invalidateQueries({ queryKey: queryKeys.help.tickets() });
          if (ticketId) qc.invalidateQueries({ queryKey: queryKeys.help.ticket(ticketId) });
          qc.invalidateQueries({ queryKey: queryKeys.help.analytics("overview") });
          return;
        case "support_ticket_messages":
          if (ticketId) {
            qc.invalidateQueries({ queryKey: queryKeys.help.messages(ticketId) });
            qc.invalidateQueries({ queryKey: queryKeys.help.ticket(ticketId) });
          }
          qc.invalidateQueries({ queryKey: queryKeys.help.tickets() });
          return;
        case "support_ticket_attachments":
          if (ticketId) {
            qc.invalidateQueries({ queryKey: queryKeys.help.attachments(ticketId) });
            qc.invalidateQueries({ queryKey: queryKeys.help.ticket(ticketId) });
          }
          return;
        case "support_feedback":
          qc.invalidateQueries({ queryKey: queryKeys.help.feedback() });
          if (feedbackId) qc.invalidateQueries({ queryKey: queryKeys.help.feedbackOne(feedbackId) });
          qc.invalidateQueries({ queryKey: queryKeys.help.analytics("overview") });
          return;
        case "support_feedback_votes":
          if (feedbackId) qc.invalidateQueries({ queryKey: queryKeys.help.votes(feedbackId) });
          qc.invalidateQueries({ queryKey: queryKeys.help.feedback() });
          if (user?.profileId) {
            qc.invalidateQueries({ queryKey: queryKeys.help.userVotes(user.profileId) });
          }
          return;
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
