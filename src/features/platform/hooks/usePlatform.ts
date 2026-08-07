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
