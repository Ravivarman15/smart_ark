// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM IDENTITY
//
// A Smart ARK employee, resolved from `platform_users`. Deliberately a SEPARATE
// principal from the ERP's staff/parent/student model — mirroring the same
// discipline AuthContext already applies to parents.
//
// A platform employee has no `profiles` row and no organization membership, so
// `useAuth().user` is null for them and every ERP surface is structurally
// incapable of rendering. That is the point: reusing the staff principal would
// make `public.is_staff()` accidentally true for a Smart ARK employee inside a
// customer's tenant.
// ──────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlatformRole =
  | "owner" | "admin" | "finance" | "support"
  | "sales" | "customer_success" | "auditor";

/** Capability strings mirror public.platform_role_capabilities. */
export type PlatformCapability =
  | "platform.users.manage" | "organizations.manage" | "organizations.read"
  | "billing.manage" | "billing.read" | "plans.manage" | "plans.read"
  | "coupons.manage" | "feature_flags.manage" | "impersonate"
  | "audit.read" | "support.manage" | "settings.manage"
  | "usage.read" | "health.read"
  // ── Phase 9A ──────────────────────────────────────────────────────────────
  // Extends the existing vocabulary rather than introducing a parallel
  // `platform.*` namespace. Two spellings for one concept would mean every
  // policy and every edge-function guard has to be checked against both,
  // forever, and the day one of them is missed is the day a capability check
  // silently passes.
  | "organizations.hold" | "organizations.archive"
  | "organizations.delete_request" | "organizations.review_delete"
  | "modules.grant" | "modules.revoke" | "modules.bulk" | "modules.govern";

export interface PlatformUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: PlatformRole;
  mfaEnrolled: boolean;
}

interface PlatformAuthValue {
  platformUser: PlatformUser | null;
  capabilities: Set<string>;
  /** True only for an ACTIVE, MFA-enrolled platform employee. */
  isPlatformUser: boolean;
  loading: boolean;
  can: (capability: PlatformCapability) => boolean;
}

const PlatformAuthContext = createContext<PlatformAuthValue | undefined>(undefined);

export const PLATFORM_USER_QUERY_KEY = ["platform-user"] as const;

async function loadPlatformUser(): Promise<{
  user: PlatformUser | null;
  capabilities: string[];
}> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) return { user: null, capabilities: [] };

  // RLS on platform_users restricts this to platform employees, so a tenant
  // user gets an empty result rather than an error — no probing signal.
  const { data, error } = await supabase
    .from("platform_users" as never)
    .select("id, user_id, email, name, role, mfa_enrolled, is_active")
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (error || !data) return { user: null, capabilities: [] };
  const r = data as unknown as Record<string, unknown>;
  if (!r.is_active) return { user: null, capabilities: [] };

  const { data: caps } = await supabase
    .from("platform_role_capabilities" as never)
    .select("capability")
    .eq("role", r.role as string);

  return {
    user: {
      id: String(r.id),
      userId: String(r.user_id),
      email: String(r.email),
      name: String(r.name),
      role: r.role as PlatformRole,
      mfaEnrolled: Boolean(r.mfa_enrolled),
    },
    capabilities: ((caps ?? []) as unknown as { capability: string }[]).map((c) => c.capability),
  };
}

export const PlatformAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, isLoading } = useQuery({
    queryKey: PLATFORM_USER_QUERY_KEY,
    queryFn: loadPlatformUser,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const value = useMemo<PlatformAuthValue>(() => {
    const user = data?.user ?? null;
    const capabilities = new Set(data?.capabilities ?? []);
    return {
      platformUser: user,
      capabilities,
      // MFA is part of the definition, not a separate warning banner. Without
      // it the access-token hook issues no platform claim, so every server-side
      // platform_can() would fail anyway — the UI must agree with the database
      // rather than showing pages whose data will not load.
      isPlatformUser: !!user && user.mfaEnrolled,
      loading: isLoading,
      can: (c) => capabilities.has(c),
    };
  }, [data, isLoading]);

  return (
    <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>
  );
};

export const usePlatformAuth = (): PlatformAuthValue => {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return ctx;
};

/** Convenience guard for a single capability. */
export const usePlatformCan = (capability: PlatformCapability): boolean =>
  usePlatformAuth().can(capability);
