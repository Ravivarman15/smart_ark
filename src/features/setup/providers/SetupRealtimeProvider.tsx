// ──────────────────────────────────────────────────────────────────────────────
// SetupRealtimeProvider — single Supabase realtime channel that keeps ALL
// Setup-derived lookups live across tabs and clients.
//
// Watches every table in SETUP_REALTIME_TABLES (standards, batches, course
// types, academic years, subjects, taxes, junctions, campuses). On any change
// it calls invalidateSetupLookups, which fans the event out to every module's
// lookup namespace — so a standard added by management appears instantly in a
// teacher's open Student Registration dropdown without a reload.
//
// Migration-safe: postgres_changes silently never fires for tables not yet in
// the `supabase_realtime` publication (added by 20260605_setup_realtime_
// publication.sql). Same-client immediacy is guaranteed regardless because the
// Setup mutations themselves also call invalidateSetupLookups.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  SETUP_REALTIME_TABLES,
  invalidateSetupLookups,
  warnSetupPublicationMissing,
} from "../lib/setupSync";

export const SetupRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("setup-sync");

    for (const table of SETUP_REALTIME_TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => invalidateSetupLookups(qc),
      );
    }

    channel.subscribe((status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        warnSetupPublicationMissing(status);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
