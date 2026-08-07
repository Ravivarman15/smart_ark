// ──────────────────────────────────────────────────────────────────────────────
// PlatformRealtimeProvider — one Supabase channel keeping the control plane
// live across tabs, screens and operators.
//
// Why this exists: the catalogue is now editable. Two people can have the Plans
// page open while one of them changes what Growth costs, and a stale price on
// the other screen is the kind of thing that ends up quoted to a customer.
// React Query's staleTime alone cannot fix that — it only refetches when the
// window regains focus or the timer expires, both of which can be minutes.
//
// Mirrors FeesRealtimeProvider deliberately: same channel-per-feature shape,
// same migration-safety property. postgres_changes silently never fires for a
// table outside the `supabase_realtime` publication, so on a database where
// 20260908_phase2d has not run this provider is an inert no-op rather than an
// error — it degrades to exactly the behaviour that existed before it.
//
// Mounted around PlatformLayout, so it lives for as long as a platform session
// is on screen and is never instantiated for a tenant user at all.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { platformKeys } from "../hooks/usePlatform";

interface Payload {
  table: string;
  schema: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

/**
 * Which query namespaces a change to each table invalidates.
 *
 * Explicit rather than "invalidate everything": a price edit should not force a
 * refetch of platform_system_health() and platform_summary(), both of which are
 * expensive aggregate RPCs. The one genuinely broad case — subscriptions —
 * earns it, because a subscription change moves the organization list, the
 * revenue tiles and the org detail page simultaneously.
 */
const AFFECTS: Record<string, () => readonly (readonly unknown[])[]> = {
  plans: () => [platformKeys.plans(), platformKeys.planPrices(), platformKeys.subscriptions()],
  plan_prices: () => [platformKeys.planPrices(), platformKeys.plans()],
  plan_features: () => [platformKeys.planFeatures(), platformKeys.plans()],
  subscriptions: () => [
    platformKeys.subscriptions(),
    platformKeys.organizations(),
    platformKeys.summary(),
  ],
  coupons: () => [platformKeys.coupons()],
  platform_settings: () => [platformKeys.settings()],
  platform_users: () => [platformKeys.users()],
  organization_features: () => [platformKeys.all],
  platform_audit_log: () => [[...platformKeys.all, "audit"]],
};

const TABLES = Object.keys(AFFECTS);

export const PlatformRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { isPlatformUser } = usePlatformAuth();

  useEffect(() => {
    // No subscription for a non-platform session. Opening a realtime channel
    // for someone whose RLS returns nothing would be a pointless connection
    // and a needless signal that these tables exist.
    if (!isPlatformUser) return;

    const channel = supabase.channel("platform-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => {
          for (const key of AFFECTS[table]()) {
            qc.invalidateQueries({ queryKey: key as unknown[] });
          }
        },
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPlatformUser, qc]);

  return <>{children}</>;
};
