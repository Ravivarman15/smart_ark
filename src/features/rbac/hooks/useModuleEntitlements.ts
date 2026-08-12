// ──────────────────────────────────────────────────────────────────────────────
// useModuleEntitlements — what the ORGANIZATION bought
//
// The tenant half of the Phase 9A control plane. `my_module_entitlements()`
// takes no argument: there is nothing to pass, therefore nothing to tamper
// with — a tenant cannot ask this question about another organization. The
// same structural isolation the Phase 7A document-branding resolver uses.
//
// ┌── FAIL-OPEN, DELIBERATELY ─────────────────────────────────────────────┐
// │ Any failure here — RPC error, migration not yet applied, network       │
// │ blip — resolves to `undefined`, and the RBAC resolver reads that as    │
// │ "no entitlement information" and allows everything.                    │
// │                                                                        │
// │ Denying instead would mean one failed request blacks out a paying      │
// │ school's entire portal mid-lesson. The downside of failing open is     │
// │ that a customer might briefly see a module they have not paid for;     │
// │ the downside of failing closed is an outage. Those are not comparable, │
// │ and the server-side RLS that actually protects the DATA is unaffected  │
// │ either way — entitlement gates the UI, never the rows.                 │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  entitlementFlags,
  resolveEntitlements,
  type EntitlementLayers,
} from "@/features/platform/modules/entitlements";

export interface ModuleEntitlements {
  /** module id → entitled. Fed straight into the RBAC resolver. */
  flags: Record<string, boolean>;
  /** Organization lifecycle status, so a portal can explain a lock-out. */
  status: string | null;
  planCode: string | null;
}

export const useModuleEntitlements = () =>
  useQuery<ModuleEntitlements | undefined>({
    queryKey: ["module-entitlements"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_module_entitlements" as never);
      // Swallowed on purpose — see the fail-open note above. Logged rather than
      // thrown so the failure is diagnosable without being user-visible.
      if (error) {
        console.warn("[entitlements] could not resolve; allowing all modules", error.message);
        return undefined;
      }
      const layers = data as unknown as EntitlementLayers | null;
      if (!layers) return undefined;
      return {
        flags: entitlementFlags(resolveEntitlements(layers)),
        status: layers.status ?? null,
        planCode: layers.plan_code ?? null,
      };
    },
    // Entitlements change when a Super Admin acts, which is rare and never
    // urgent to the second. Five minutes keeps this off the hot path of every
    // navigation while still picking up a grant within one coffee break.
    staleTime: 5 * 60_000,
    retry: 1,
  });
