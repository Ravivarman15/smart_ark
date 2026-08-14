// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM DATA HOOKS
//
// Query keys are namespaced under "platform" and deliberately NOT under the
// tenant-scoped `withOrg()` helper: control-plane data has no organization
// context, and namespacing it by tenant would evict it on every impersonation
// round trip.
// ──────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { platformService, type Coupon, type Plan } from "../services/platform.service";

export const platformKeys = {
  all: ["platform"] as const,
  summary: () => [...platformKeys.all, "summary"] as const,
  health: () => [...platformKeys.all, "health"] as const,
  organizations: () => [...platformKeys.all, "organizations"] as const,
  organization: (id: string) => [...platformKeys.all, "organization", id] as const,
  plans: () => [...platformKeys.all, "plans"] as const,
  planPrices: () => [...platformKeys.all, "plan-prices"] as const,
  planFeatures: () => [...platformKeys.all, "plan-features"] as const,
  subscriptions: () => [...platformKeys.all, "subscriptions"] as const,
  coupons: () => [...platformKeys.all, "coupons"] as const,
  audit: (f?: Record<string, unknown>) => [...platformKeys.all, "audit", f ?? {}] as const,
  usage: (days: number) => [...platformKeys.all, "usage", days] as const,
  features: (orgId: string) => [...platformKeys.all, "features", orgId] as const,
  settings: () => [...platformKeys.all, "settings"] as const,
  users: () => [...platformKeys.all, "users"] as const,
  impersonations: () => [...platformKeys.all, "impersonations"] as const,
  entitlements: (orgId: string) => [...platformKeys.all, "entitlements", orgId] as const,
  matrix: () => [...platformKeys.all, "module-matrix"] as const,
  governance: () => [...platformKeys.all, "module-governance"] as const,
  deleteRequests: () => [...platformKeys.all, "delete-requests"] as const,
  protections: () => [...platformKeys.all, "protections"] as const,
};

export const usePlatformSummary = () =>
  useQuery({
    queryKey: platformKeys.summary(),
    queryFn: () => platformService.summary(),
    // The dashboard reads a nightly rollup, not live counts — refetching it
    // every 30 seconds would be pure noise against a table that changes once a
    // day. The "as of" timestamp on the page is what tells the truth.
    staleTime: 60_000,
  });

export const useSystemHealth = () =>
  useQuery({
    queryKey: platformKeys.health(),
    queryFn: () => platformService.systemHealth(),
    // Health IS live — queue depth and connection count move minute to minute.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export const useOrganizations = () =>
  useQuery({
    queryKey: platformKeys.organizations(),
    queryFn: () => platformService.organizations(),
    staleTime: 60_000,
  });

export const useOrganizationDetail = (id: string | undefined) =>
  useQuery({
    queryKey: platformKeys.organization(id ?? ""),
    queryFn: () => platformService.organizationDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

// staleTime is short now that the catalogue is editable. PlatformRealtimeProvider
// pushes the invalidation the instant a row changes, so this is only the
// fallback for a session whose websocket dropped — five minutes of a wrong
// price on screen was acceptable for read-only seed data and is not acceptable
// for a number an operator is actively editing.
export const usePlans = () =>
  useQuery({ queryKey: platformKeys.plans(), queryFn: () => platformService.plans(), staleTime: 30_000 });

export const usePlanPrices = () =>
  useQuery({ queryKey: platformKeys.planPrices(), queryFn: () => platformService.planPrices(), staleTime: 30_000 });

export const usePlanFeatures = () =>
  useQuery({ queryKey: platformKeys.planFeatures(), queryFn: () => platformService.planFeatures(), staleTime: 30_000 });

export const useSubscriptions = () =>
  useQuery({ queryKey: platformKeys.subscriptions(), queryFn: () => platformService.subscriptions(), staleTime: 60_000 });

export const useCoupons = () =>
  useQuery({ queryKey: platformKeys.coupons(), queryFn: () => platformService.coupons(), staleTime: 60_000 });

export const usePlatformAudit = (filters?: { action?: string; organizationId?: string; limit?: number }) =>
  useQuery({
    queryKey: platformKeys.audit(filters),
    queryFn: () => platformService.audit(filters),
    staleTime: 15_000,
  });

export const useUsageTrend = (days = 30) =>
  useQuery({ queryKey: platformKeys.usage(days), queryFn: () => platformService.usageTrend(days), staleTime: 120_000 });

export const useOrganizationFeatures = (orgId: string | undefined) =>
  useQuery({
    queryKey: platformKeys.features(orgId ?? ""),
    queryFn: () => platformService.organizationFeatures(orgId!),
    enabled: !!orgId,
  });

export const usePlatformSettings = () =>
  useQuery({ queryKey: platformKeys.settings(), queryFn: () => platformService.settings(), staleTime: 300_000 });

export const usePlatformUsers = () =>
  useQuery({ queryKey: platformKeys.users(), queryFn: () => platformService.platformUsers(), staleTime: 120_000 });

export const useImpersonationGrants = () =>
  useQuery({ queryKey: platformKeys.impersonations(), queryFn: () => platformService.impersonationGrants(), staleTime: 30_000 });

// ── Mutations ───────────────────────────────────────────────────────────────

export const useCreateOrganization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.createOrganization>[0]) =>
      platformService.createOrganization(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.organizations() });
      qc.invalidateQueries({ queryKey: platformKeys.summary() });
      toast.success("Organization provisioned");
    },
    // Surface the message verbatim: when the tenancy readiness guard refuses,
    // it names exactly which flag is unmet — the single most useful error in
    // the whole system, and paraphrasing it would throw that away.
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetOrganizationStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      platformService.setOrganizationStatus(id, status, reason),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.organizations() });
      qc.invalidateQueries({ queryKey: platformKeys.organization(v.id) });
      toast.success(`Organization set to ${v.status}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRefreshMetrics = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId?: string) => platformService.refreshMetrics(orgId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: platformKeys.all });
      toast.success(`Metrics refreshed for ${r.organizations} organization(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSavePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Plan> & { code: string; name: string }) => platformService.savePlan(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.plans() });
      toast.success("Plan saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSavePlanPrice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Parameters<typeof platformService.savePlanPrice>[0]) =>
      platformService.savePlanPrice(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.planPrices() });
      toast.success("Price saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePlanPrice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformService.deletePlanPrice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.planPrices() });
      toast.success("Price removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetPlanFeature = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, key, enabled }: { planId: string; key: string; enabled: boolean }) =>
      platformService.setPlanFeature(planId, key, enabled),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.planFeatures() });
      toast.success(`${v.key} ${v.enabled ? "included" : "excluded"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSaveSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      platformService.saveSetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.settings() });
      toast.success("Setting saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSaveCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Partial<Coupon> & { code: string }) => platformService.saveCoupon(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.coupons() });
      toast.success("Coupon saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetFeature = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, key, enabled }: { orgId: string; key: string; enabled: boolean }) =>
      platformService.setFeature(orgId, key, enabled),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.features(v.orgId) });
      qc.invalidateQueries({ queryKey: platformKeys.organization(v.orgId) });
      toast.success(`${v.key} ${v.enabled ? "enabled" : "disabled"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSaveSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.saveSubscription>[0]) =>
      platformService.saveSubscription(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.subscriptions() });
      qc.invalidateQueries({ queryKey: platformKeys.organizations() });
      toast.success("Subscription saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useInvitePlatformUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.invitePlatformUser>[0]) =>
      platformService.invitePlatformUser(input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: platformKeys.users() });
      toast.success("Platform user invited", { description: r.note });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ── Phase 9A: entitlements, governance, lifecycle ───────────────────────────

export const useEntitlementLayers = (orgId: string | undefined) =>
  useQuery({
    queryKey: platformKeys.entitlements(orgId ?? ""),
    queryFn: () => platformService.entitlementLayers(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  });

export const useModuleMatrix = () =>
  useQuery({ queryKey: platformKeys.matrix(), queryFn: () => platformService.moduleMatrix(), staleTime: 60_000 });

export const useModuleGovernance = () =>
  useQuery({ queryKey: platformKeys.governance(), queryFn: () => platformService.moduleGovernance(), staleTime: 60_000 });

export const useDeleteRequests = () =>
  useQuery({ queryKey: platformKeys.deleteRequests(), queryFn: () => platformService.deleteRequests(), staleTime: 30_000 });

export const useProtections = () =>
  useQuery({ queryKey: platformKeys.protections(), queryFn: () => platformService.protections(), staleTime: 300_000 });

/**
 * Invalidate everything a module/lifecycle change could have moved.
 *
 * The matrix and the per-organization layers are separate cache entries built
 * from the same rows, so refreshing one and not the other is how the detail
 * page and the matrix end up disagreeing in front of an operator.
 */
const invalidateEntitlements = (qc: ReturnType<typeof useQueryClient>, orgId?: string) => {
  if (orgId) {
    qc.invalidateQueries({ queryKey: platformKeys.entitlements(orgId) });
    qc.invalidateQueries({ queryKey: platformKeys.organization(orgId) });
    qc.invalidateQueries({ queryKey: platformKeys.features(orgId) });
  }
  qc.invalidateQueries({ queryKey: platformKeys.matrix() });
  qc.invalidateQueries({ queryKey: platformKeys.organizations() });
  qc.invalidateQueries({ queryKey: platformKeys.audit() });
};

export const useSetModule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.setModule>[0]) =>
      platformService.setModule(input),
    onSuccess: (r, v) => {
      invalidateEntitlements(qc, v.organizationId);
      // "No change" is reported honestly rather than as a success everyone
      // misreads — re-granting a module the tenant already has did nothing,
      // and saying "Granted" would suggest otherwise.
      toast.success(
        r.changed
          ? `${v.moduleKey} ${v.enabled ? "granted" : "revoked"}`
          : `${v.moduleKey} was already ${v.enabled ? "enabled" : "disabled"} — no change`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useClearModuleOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, moduleKey }: { organizationId: string; moduleKey: string }) =>
      platformService.clearModuleOverride(organizationId, moduleKey),
    onSuccess: (r, v) => {
      invalidateEntitlements(qc, v.organizationId);
      toast.success(r.removed ? `${v.moduleKey} returned to the plan default` : "No override to remove");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useBulkModules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.bulkModules>[0]) =>
      platformService.bulkModules(input),
    onSuccess: (r) => {
      invalidateEntitlements(qc);
      const ok = r.results.filter((x) => x.ok).length;
      const skipped = r.results.length - ok;
      toast.success(`Applied to ${ok} organization${ok === 1 ? "" : "s"}`, {
        description: skipped ? `${skipped} skipped — open the batch to see why.` : undefined,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetFeatureDefault = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.setFeatureDefault>[0]) =>
      platformService.setFeatureDefault(input),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.governance() });
      invalidateEntitlements(qc);
      if (v.enabled === null) {
        toast.success(`${v.featureKey} default cleared`);
        return;
      }
      const n = r.cleared?.cleared ?? 0;
      const skipped = r.cleared?.protected_skipped ?? 0;
      toast.success(
        `${v.featureKey} ${v.enabled ? "enabled" : "disabled"} for every organization`,
        {
          description: [
            "Applies to organizations created from now on.",
            n ? `${n} conflicting override${n === 1 ? "" : "s"} removed.` : null,
            skipped ? `${skipped} protected organization left untouched.` : null,
          ].filter(Boolean).join(" "),
        },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetModuleGovernance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleKey, available, note }: { moduleKey: string; available: boolean; note?: string }) =>
      platformService.setModuleGovernance(moduleKey, available, note),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.governance() });
      invalidateEntitlements(qc);
      toast.success(v.available ? `${v.moduleKey} available platform-wide` : `${v.moduleKey} withdrawn platform-wide`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetLifecycle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.setLifecycle>[0]) =>
      platformService.setLifecycle(input),
    onSuccess: (r, v) => {
      invalidateEntitlements(qc, v.organizationId);
      toast.success(r.changed ? `Organization set to ${v.status}` : `Already ${v.status} — no change`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateOrganizationProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.updateOrganizationProfile>[0]) =>
      platformService.updateOrganizationProfile(input),
    onSuccess: (_r, v) => {
      invalidateEntitlements(qc, v.organizationId);
      toast.success("Organization updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRequestDelete = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.requestDelete>[0]) =>
      platformService.requestDelete(input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: platformKeys.deleteRequests() });
      toast.success(
        r.created ? "Delete request opened for review" : "A request is already open for this organization",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useReviewDelete = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof platformService.reviewDelete>[0]) =>
      platformService.reviewDelete(input),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: platformKeys.deleteRequests() });
      toast.success(v.decision === "approved" ? "Request approved for manual erasure" : "Request cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
