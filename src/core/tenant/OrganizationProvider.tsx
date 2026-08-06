// ──────────────────────────────────────────────────────────────────────────────
// ORGANIZATION PROVIDER
//
// Resolves the active organization once per session and makes it available to
// the whole app. Sits BELOW AuthProvider (the org comes from the session) and
// ABOVE everything that fetches data (so the query cache can be namespaced by
// tenant before a single request goes out).
//
// ┌── THE FAILURE MODE THIS EXISTS TO PREVENT ─────────────────────────────┐
// │ RLS cannot protect data that never leaves the browser. If a user       │
// │ switches organization and the React Query cache still holds the        │
// │ previous tenant's rows under the same key, the UI happily renders      │
// │ them — no request is made, so no policy is consulted.                  │
// │                                                                        │
// │ That is why the effect below CLEARS the entire cache on any change of  │
// │ organization id, and why queryKeys.withOrg() exists.                   │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchActiveOrganization,
  hostMatchesOrg,
  __setActiveOrganization,
  type Organization,
} from "./tenant";

interface OrganizationContextValue {
  organization: Organization | null;
  organizationId: string | null;
  loading: boolean;
  /** True when the hostname implies a different tenant than the session. */
  hostMismatch: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export const ORGANIZATION_QUERY_KEY = ["active-organization"] as const;

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isParentAuthenticated, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const signedIn = isAuthenticated || isParentAuthenticated;

  const { data, isLoading } = useQuery({
    queryKey: ORGANIZATION_QUERY_KEY,
    queryFn: fetchActiveOrganization,
    enabled: signedIn && !authLoading,
    // The organization record changes very rarely; refetching it on every
    // window focus would be pure noise on top of every page.
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const organization = data ?? null;

  // Mirror into the module cache so non-React callers (services, storage path
  // helper) can read it synchronously. Runs during render rather than in an
  // effect: a service invoked from an event handler in the same commit would
  // otherwise still see the previous value.
  __setActiveOrganization(organization);

  // ── Cache isolation on tenant change ──────────────────────────────────────
  const previousOrgId = useRef<string | null>(null);
  useEffect(() => {
    const id = organization?.id ?? null;
    if (previousOrgId.current !== null && previousOrgId.current !== id) {
      // Hard clear, not invalidate. invalidateQueries marks data stale but
      // KEEPS it, so components re-render with the old tenant's rows while the
      // refetch is in flight. For a tenant boundary that is not acceptable.
      qc.clear();
    }
    previousOrgId.current = id;
  }, [organization?.id, qc]);

  useEffect(() => {
    if (!signedIn) {
      __setActiveOrganization(null);
      previousOrgId.current = null;
    }
  }, [signedIn]);

  const hostMismatch = useMemo(
    () => signedIn && !isLoading && !hostMatchesOrg(organization),
    [signedIn, isLoading, organization],
  );

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organization,
      organizationId: organization?.id ?? null,
      loading: authLoading || (signedIn && isLoading),
      hostMismatch,
    }),
    [organization, authLoading, signedIn, isLoading, hostMismatch],
  );

  return (
    <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
  );
};

export const useOrganization = (): OrganizationContextValue => {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error("useOrganization must be used within OrganizationProvider");
  return ctx;
};
