// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM CONTROL-PLANE SERVICE
//
// Every read here goes through an RPC that returns AGGREGATES, or through a
// platform_* table with its own RLS. Nothing in this file selects from a
// tenant table — no students, no fees, no payroll, no message bodies.
//
// That is not a coding convention; it is the security boundary. A
// `.from("students")` added to this file would be an RLS bypass in all but
// name, and there is a CI gate asserting it never appears.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { AppError } from "@/shared/services";
import type { EntitlementLayers } from "../modules/entitlements";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrganizationOverview {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  institutionType: string;
  country: string;
  createdAt: string;
  provisionedAt: string | null;
  deletedAt: string | null;
  planCode: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  students: number;
  activeStudents: number;
  staff: number;
  parents: number;
  branches: number;
  storageBytes: number;
  messages30d: number;
  lastMetricAt: string | null;
  healthScore: number;
}

export interface PlatformSummary {
  organizations: { total: number; active: number; trialing: number; suspended: number; cancelled: number; new_30d: number };
  tenancy: { students: number; active_students: number; staff: number; parents: number; branches: number; storage_bytes: number } | null;
  usage_30d: { messages: number; whatsapp: number; emails: number } | null;
  metrics_freshness: string | null;
  generated_at: string;
}

export interface Plan {
  id: string; code: string; name: string; description: string | null;
  tierOrder: number; isPublic: boolean; isActive: boolean;
  trialDays: number; graceDays: number; supportLevel: string;
  maxStudents: number | null; maxStaff: number | null; maxBranches: number | null;
  maxStorageMb: number | null; whatsappCredits: number | null;
  emailCredits: number | null; aiCredits: number | null;
  apiRequestsPerDay: number | null;
  allowWhiteLabel: boolean; allowCustomDomain: boolean; allowMarketplace: boolean;
}

export interface PlanPrice {
  id: string; planId: string; currency: string; interval: string;
  amount: number; taxPercent: number; isActive: boolean;
}

export interface PlanFeature {
  planId: string; featureKey: string; enabled: boolean; limitValue: number | null;
}

export interface Coupon {
  id: string; code: string; description: string | null;
  discountType: "percentage" | "fixed"; discountValue: number;
  duration: string; maxRedemptions: number | null; redemptionCount: number;
  maxPerOrganization: number; validFrom: string; validUntil: string | null;
  isActive: boolean;
}

export interface AuditEntry {
  id: number; actorEmail: string | null; action: string;
  targetType: string | null; targetId: string | null;
  organizationId: string | null; detail: string | null;
  createdAt: string;
}

export interface ImpersonationGrant {
  id: string; organizationId: string; targetUserId: string;
  reason: string; ticketRef: string | null; customerConsent: boolean;
  startedAt: string; expiresAt: string; endedAt: string | null;
}

export interface MatrixRow {
  id: string; slug: string; displayName: string; status: string;
  protected: boolean; layers: EntitlementLayers;
}

export interface ModuleGovernance {
  moduleKey: string; isGloballyAvailable: boolean;
  /**
   * The platform default. `null` means none is set, which is not the same as
   * `false` — none means "included when nothing else says otherwise", false
   * means Smart ARK has decided against it for every tenant.
   */
  defaultEnabled: boolean | null;
  note: string | null; updatedAt: string | null;
}

export interface DeleteRequest {
  id: string; organizationId: string; organizationSlug: string;
  status: string; reason: string; requestedEmail: string | null;
  requestedAt: string; eligibleAt: string;
  reviewedAt: string | null; reviewNote: string | null;
}

/**
 * The result of a purge — preview or execution.
 *
 * `tables` is table name → row count. On a dry run those are the rows that
 * WOULD go; on an execution they are the rows the sweep deleted directly, and
 * the two differ because some rows disappear by cascade from a parent deleted
 * first. `verified_empty` is the completeness proof, not the count.
 */
export interface PurgeReport {
  ok: boolean;
  dry_run: boolean;
  organization: string;
  status?: string;
  purged?: boolean;
  verified_empty?: boolean;
  total_rows: number;
  rows_deleted?: number;
  passes?: number;
  tables: Record<string, number>;
  storage?: { removed: number; buckets: string[]; errors: string[] };
}

// ── Invoicing ───────────────────────────────────────────────────────────────

/** The six the CHECK constraint on `invoices.status` allows. */
export type InvoiceStatus = "draft" | "issued" | "paid" | "void" | "refunded" | "overdue";

/**
 * How the supply is taxed, decided by `compute_gst()` from state codes.
 *
 * Carried on the invoice rather than recomputed for display: the treatment is a
 * fact about the day it was issued, and a customer who later moves state must
 * not retroactively change the tax on an invoice already filed.
 */
export type GstTreatment = "cgst_sgst" | "igst" | "export" | "sez" | "reverse_charge";

export interface PlatformInvoice {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  subscriptionId: string | null;
  number: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
  gstTreatment: GstTreatment | null;
  placeOfSupply: string | null;
  gstin: string | null;
  financialYear: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  provider: string | null;
  providerPaymentId: string | null;
  pdfPath: string | null;
  emailedAt: string | null;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  taxPercent: number;
  hsnSac: string | null;
}

export interface InvoiceSequence {
  organizationId: string;
  financialYear: string;
  prefix: string;
  lastNumber: number;
}

// ── Disaster recovery ───────────────────────────────────────────────────────

export const DR_POLICY_KEY = "dr_policy";
export const DR_REHEARSALS_KEY = "dr_rehearsals";

/**
 * What the Backups page claimed as prose before it could store anything.
 *
 * Kept as the defaults so an unconfigured platform shows the posture that was
 * already written down, rather than zeros that would read as "no policy".
 */
export const DR_DEFAULTS = {
  rpoMinutes: 5,
  rtoHours: 4,
  pitrRetentionDays: 7,
  rehearsalIntervalDays: 30,
  exportRetentionDays: 30,
} as const;

export interface DrPolicy {
  rpoMinutes: number;
  rtoHours: number;
  pitrRetentionDays: number;
  rehearsalIntervalDays: number;
  exportRetentionDays: number;
}

export type DrOutcome = "pass" | "fail";

export interface DrRehearsal {
  id: string;
  performedAt: string;
  performedBy: string;
  /** The PITR timestamp that was restored to. */
  restoredTo: string | null;
  outcome: DrOutcome;
  minutesToRestore: number | null;
  notes: string | null;
}

export interface OrganizationExport {
  ok: boolean;
  organizationId: string;
  slug: string;
  generatedAt: string;
  dryRun: boolean;
  totalRows: number;
  tables: Record<string, number>;
  /** Absent on a dry run — the manifest is shown before the data is fetched. */
  data?: Record<string, Record<string, unknown>[]>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : Number(v ?? d) || d);
const str = (v: unknown) => (v == null ? null : String(v));

const toInvoice = (r: Record<string, unknown>): PlatformInvoice => {
  const org = (r.organizations ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    // legal_name first: an invoice is addressed to the legal entity, not the
    // trading name shown in the app.
    organizationName: String(org.legal_name ?? org.display_name ?? org.slug ?? "—"),
    organizationSlug: String(org.slug ?? ""),
    subscriptionId: str(r.subscription_id),
    number: String(r.invoice_number),
    status: String(r.status) as InvoiceStatus,
    currency: String(r.currency ?? "INR"),
    subtotal: num(r.subtotal),
    discountTotal: num(r.discount_total),
    taxTotal: num(r.tax_total),
    total: num(r.total),
    cgst: num(r.cgst),
    sgst: num(r.sgst),
    igst: num(r.igst),
    gstTreatment: (str(r.gst_treatment) as GstTreatment | null) ?? null,
    placeOfSupply: str(r.place_of_supply),
    gstin: str(r.gstin),
    financialYear: str(r.financial_year),
    periodStart: str(r.period_start),
    periodEnd: str(r.period_end),
    issuedAt: str(r.issued_at),
    dueAt: str(r.due_at),
    paidAt: str(r.paid_at),
    notes: str(r.notes),
    provider: str(r.provider),
    providerPaymentId: str(r.provider_payment_id),
    pdfPath: str(r.pdf_path),
    emailedAt: str(r.emailed_at),
    createdAt: String(r.created_at),
  };
};


/** Invoke the privileged edge function and normalise its error shape. */
async function invokePlatform<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("platform-admin", {
    body: { action, ...payload },
  });
  if (error) {
    // The function returns a useful message body on 4xx; supabase-js surfaces
    // only a generic FunctionsHttpError, so prefer the body when present.
    const detail = (data as { error?: string } | null)?.error;
    throw AppError.validation(detail ?? error.message);
  }
  if ((data as { error?: string } | null)?.error) {
    throw AppError.validation((data as { error: string }).error);
  }
  return data as T;
}

// ── Service ─────────────────────────────────────────────────────────────────

class PlatformService {
  // ── Dashboard ────────────────────────────────────────────────────────────
  async summary(): Promise<PlatformSummary | null> {
    const { data, error } = await supabase.rpc("platform_summary" as never);
    if (error) throw AppError.fromSupabase(error, "platform_summary");
    return (data as unknown as PlatformSummary) ?? null;
  }

  async systemHealth(): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc("platform_system_health" as never);
    if (error) throw AppError.fromSupabase(error, "platform_system_health");
    return (data as unknown as Record<string, unknown>) ?? null;
  }

  // ── Organizations ────────────────────────────────────────────────────────
  async organizations(): Promise<OrganizationOverview[]> {
    const { data, error } = await supabase.rpc("platform_organization_overview" as never);
    if (error) throw AppError.fromSupabase(error, "platform_organization_overview");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      displayName: String(r.display_name),
      status: String(r.status),
      institutionType: String(r.institution_type ?? ""),
      country: String(r.country ?? ""),
      createdAt: String(r.created_at),
      provisionedAt: str(r.provisioned_at),
      deletedAt: str(r.deleted_at),
      planCode: str(r.plan_code),
      subscriptionStatus: str(r.subscription_status),
      trialEndsAt: str(r.trial_ends_at),
      students: num(r.students),
      activeStudents: num(r.active_students),
      staff: num(r.staff),
      parents: num(r.parents),
      branches: num(r.branches),
      storageBytes: num(r.storage_bytes),
      messages30d: num(r.messages_30d),
      lastMetricAt: str(r.last_metric_at),
      healthScore: num(r.health_score),
    }));
  }

  async organizationDetail(orgId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc("platform_organization_detail" as never, {
      _org: orgId,
    } as never);
    if (error) throw AppError.fromSupabase(error, "platform_organization_detail");
    return (data as unknown as Record<string, unknown>) ?? null;
  }

  createOrganization(input: {
    slug: string; legalName: string; displayName?: string;
    institutionType?: string; country?: string; timezone?: string; currency?: string;
  }) {
    return invokePlatform<{ ok: boolean; organizationId: string }>("create_organization", input);
  }

  setOrganizationStatus(organizationId: string, status: string, reason?: string) {
    return invokePlatform<{ ok: boolean }>("set_status", { organizationId, status, reason });
  }

  refreshMetrics(organizationId?: string) {
    return invokePlatform<{ ok: boolean; organizations: number }>("refresh_metrics", {
      organizationId: organizationId ?? null,
    });
  }

  // ── Impersonation ────────────────────────────────────────────────────────
  startImpersonation(input: {
    organizationId: string; targetUserId: string; reason: string;
    ticketRef?: string; minutes?: number; customerConsent?: boolean;
  }) {
    return invokePlatform<{
      ok: boolean; grantId: string; expiresAt: string; tokenHash: string; email: string;
    }>("start_impersonation", input);
  }

  endImpersonation(grantId: string, reason?: string) {
    return invokePlatform<{ ok: boolean }>("end_impersonation", { grantId, reason });
  }

  async impersonationGrants(limit = 100): Promise<ImpersonationGrant[]> {
    const { data, error } = await supabase
      .from("platform_impersonation_grants" as never)
      .select("id, organization_id, target_user_id, reason, ticket_ref, customer_consent, started_at, expires_at, ended_at")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw AppError.fromSupabase(error, "impersonation_grants");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      targetUserId: String(r.target_user_id),
      reason: String(r.reason),
      ticketRef: str(r.ticket_ref),
      customerConsent: Boolean(r.customer_consent),
      startedAt: String(r.started_at),
      expiresAt: String(r.expires_at),
      endedAt: str(r.ended_at),
    }));
  }

  // ── Plans & pricing ──────────────────────────────────────────────────────
  async plans(): Promise<Plan[]> {
    const { data, error } = await supabase
      .from("plans" as never)
      .select("*")
      .order("tier_order");
    if (error) throw AppError.fromSupabase(error, "plans");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), code: String(r.code), name: String(r.name),
      description: str(r.description), tierOrder: num(r.tier_order),
      isPublic: Boolean(r.is_public), isActive: Boolean(r.is_active),
      trialDays: num(r.trial_days), graceDays: num(r.grace_days),
      supportLevel: String(r.support_level),
      maxStudents: r.max_students == null ? null : num(r.max_students),
      maxStaff: r.max_staff == null ? null : num(r.max_staff),
      maxBranches: r.max_branches == null ? null : num(r.max_branches),
      maxStorageMb: r.max_storage_mb == null ? null : num(r.max_storage_mb),
      whatsappCredits: r.whatsapp_credits == null ? null : num(r.whatsapp_credits),
      emailCredits: r.email_credits == null ? null : num(r.email_credits),
      aiCredits: r.ai_credits == null ? null : num(r.ai_credits),
      apiRequestsPerDay: r.api_requests_per_day == null ? null : num(r.api_requests_per_day),
      allowWhiteLabel: Boolean(r.allow_white_label),
      allowCustomDomain: Boolean(r.allow_custom_domain),
      allowMarketplace: Boolean(r.allow_marketplace),
    }));
  }

  async planPrices(): Promise<PlanPrice[]> {
    const { data, error } = await supabase
      .from("plan_prices" as never)
      .select("*")
      .order("amount");
    if (error) throw AppError.fromSupabase(error, "plan_prices");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), planId: String(r.plan_id), currency: String(r.currency),
      interval: String(r.interval), amount: num(r.amount),
      taxPercent: num(r.tax_percent), isActive: Boolean(r.is_active),
    }));
  }

  /**
   * Create or update a plan, keyed on `code`.
   *
   * `.select("id")` is not optional decoration. `plans` is FORCE-RLS with a
   * write policy requiring `plans.manage`; PostgREST answers an UPDATE that
   * matched zero rows with 204 and error === null, so a caller lacking the
   * capability would see a green "Plan saved" toast over a database that
   * changed nothing. Asking for the row back is the only way to tell the two
   * apart.
   */
  async savePlan(plan: Partial<Plan> & { code: string; name: string }): Promise<void> {
    const row = {
      code: plan.code, name: plan.name, description: plan.description ?? null,
      tier_order: plan.tierOrder ?? 0, is_public: plan.isPublic ?? true,
      is_active: plan.isActive ?? true, trial_days: plan.trialDays ?? 14,
      grace_days: plan.graceDays ?? 7, support_level: plan.supportLevel ?? "email",
      max_students: plan.maxStudents ?? null, max_staff: plan.maxStaff ?? null,
      max_branches: plan.maxBranches ?? null, max_storage_mb: plan.maxStorageMb ?? null,
      whatsapp_credits: plan.whatsappCredits ?? null,
      email_credits: plan.emailCredits ?? null, ai_credits: plan.aiCredits ?? null,
      api_requests_per_day: plan.apiRequestsPerDay ?? null,
      allow_white_label: plan.allowWhiteLabel ?? false,
      allow_custom_domain: plan.allowCustomDomain ?? false,
      allow_marketplace: plan.allowMarketplace ?? false,
    };
    const { data, error } = await supabase
      .from("plans" as never)
      .upsert(row as never, { onConflict: "code" })
      .select("id");
    if (error) throw AppError.fromSupabase(error, "plans.save");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `plans.manage` capability.",
      );
    }
  }

  async savePlanPrice(price: {
    id?: string; planId: string; currency: string; interval: string;
    amount: number; taxPercent: number; isActive: boolean;
  }): Promise<void> {
    const row = {
      plan_id: price.planId, currency: price.currency.toUpperCase(),
      interval: price.interval, amount: price.amount,
      tax_percent: price.taxPercent, is_active: price.isActive,
    };
    // UNIQUE (plan_id, currency, interval) is the natural key, so an upsert on
    // it means "set the yearly INR price of Growth" is one idempotent call
    // whether or not that price already existed.
    const { data, error } = await supabase
      .from("plan_prices" as never)
      .upsert(row as never, { onConflict: "plan_id,currency,interval" })
      .select("id");
    if (error) throw AppError.fromSupabase(error, "plan_prices.save");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `plans.manage` capability.",
      );
    }
  }

  async deletePlanPrice(id: string): Promise<void> {
    const { data, error } = await supabase
      .from("plan_prices" as never)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw AppError.fromSupabase(error, "plan_prices.delete");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was deleted — your platform role lacks the `plans.manage` capability.",
      );
    }
  }

  async planFeatures(): Promise<PlanFeature[]> {
    const { data, error } = await supabase
      .from("plan_features" as never)
      .select("plan_id, feature_key, enabled, limit_value");
    if (error) throw AppError.fromSupabase(error, "plan_features");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      planId: String(r.plan_id), featureKey: String(r.feature_key),
      enabled: Boolean(r.enabled),
      limitValue: r.limit_value == null ? null : num(r.limit_value),
    }));
  }

  async setPlanFeature(planId: string, featureKey: string, enabled: boolean): Promise<void> {
    const { data, error } = await supabase
      .from("plan_features" as never)
      .upsert({ plan_id: planId, feature_key: featureKey, enabled } as never,
              { onConflict: "plan_id,feature_key" })
      .select("feature_key");
    if (error) throw AppError.fromSupabase(error, "plan_features.set");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `plans.manage` capability.",
      );
    }
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  async subscriptions(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from("subscriptions" as never)
      .select("*, organizations(slug, display_name), plans(code, name)")
      .order("created_at", { ascending: false });
    if (error) throw AppError.fromSupabase(error, "subscriptions");
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  async saveSubscription(input: {
    id?: string; organizationId: string; planId: string; status: string;
    interval: string; amount: number; autoRenew: boolean;
    currentPeriodEnd?: string | null; notes?: string | null;
  }): Promise<void> {
    const row = {
      organization_id: input.organizationId, plan_id: input.planId,
      status: input.status, interval: input.interval, amount: input.amount,
      auto_renew: input.autoRenew,
      current_period_end: input.currentPeriodEnd ?? null,
      notes: input.notes ?? null, updated_at: new Date().toISOString(),
    };
    const q = input.id
      ? supabase.from("subscriptions" as never).update(row as never).eq("id", input.id).select("id")
      : supabase.from("subscriptions" as never).insert(row as never).select("id");
    const { data, error } = await q;
    if (error) throw AppError.fromSupabase(error, "subscriptions.save");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `billing.manage` capability.",
      );
    }
  }

  // ── Coupons ──────────────────────────────────────────────────────────────
  async coupons(): Promise<Coupon[]> {
    const { data, error } = await supabase
      .from("coupons" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw AppError.fromSupabase(error, "coupons");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), code: String(r.code), description: str(r.description),
      discountType: r.discount_type as Coupon["discountType"],
      discountValue: num(r.discount_value), duration: String(r.duration),
      maxRedemptions: r.max_redemptions == null ? null : num(r.max_redemptions),
      redemptionCount: num(r.redemption_count),
      maxPerOrganization: num(r.max_per_organization, 1),
      validFrom: String(r.valid_from), validUntil: str(r.valid_until),
      isActive: Boolean(r.is_active),
    }));
  }

  async saveCoupon(c: Partial<Coupon> & { code: string }): Promise<void> {
    const row = {
      code: c.code.toUpperCase(), description: c.description ?? null,
      discount_type: c.discountType ?? "percentage",
      discount_value: c.discountValue ?? 0, duration: c.duration ?? "once",
      max_redemptions: c.maxRedemptions ?? null,
      max_per_organization: c.maxPerOrganization ?? 1,
      valid_until: c.validUntil ?? null, is_active: c.isActive ?? true,
    };
    const { data, error } = await supabase
      .from("coupons" as never)
      .upsert(row as never, { onConflict: "code" })
      .select("id");
    if (error) throw AppError.fromSupabase(error, "coupons.save");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `coupons.manage` capability.",
      );
    }
  }

  // ── Feature flags ────────────────────────────────────────────────────────
  async organizationFeatures(orgId: string): Promise<Record<string, boolean>> {
    const { data, error } = await supabase
      .from("organization_features" as never)
      .select("feature_key, enabled")
      .eq("organization_id", orgId);
    if (error) throw AppError.fromSupabase(error, "organization_features");
    const out: Record<string, boolean> = {};
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      out[String(r.feature_key)] = Boolean(r.enabled);
    }
    return out;
  }

  async setFeature(orgId: string, featureKey: string, enabled: boolean, reason = "sales_override") {
    const { data, error } = await supabase
      .from("organization_features" as never)
      .upsert(
        {
          organization_id: orgId, feature_key: featureKey, enabled, reason,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "organization_id,feature_key" },
      )
      .select("feature_key");
    if (error) throw AppError.fromSupabase(error, "organization_features.set");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `feature_flags.manage` capability.",
      );
    }
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  async audit(filters?: { action?: string; organizationId?: string; limit?: number }): Promise<AuditEntry[]> {
    let q = supabase
      .from("platform_audit_log" as never)
      .select("id, actor_email, action, target_type, target_id, organization_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 200);
    if (filters?.action) q = q.eq("action", filters.action);
    if (filters?.organizationId) q = q.eq("organization_id", filters.organizationId);
    const { data, error } = await q;
    if (error) throw AppError.fromSupabase(error, "platform_audit_log");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: num(r.id), actorEmail: str(r.actor_email), action: String(r.action),
      targetType: str(r.target_type), targetId: str(r.target_id),
      organizationId: str(r.organization_id), detail: str(r.detail),
      createdAt: String(r.created_at),
    }));
  }

  // ── Usage ────────────────────────────────────────────────────────────────
  async usageTrend(days = 30): Promise<Record<string, unknown>[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("organization_metrics_daily" as never)
      .select("metric_date, students, active_students, staff, parents, messages_sent, whatsapp_sent, emails_sent, storage_bytes, fees_collected")
      .gte("metric_date", since)
      .order("metric_date");
    if (error) throw AppError.fromSupabase(error, "usage_trend");
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  // ── Platform settings ────────────────────────────────────────────────────
  async settings(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from("platform_settings" as never)
      .select("key, value, is_secret, description, updated_at")
      .order("key");
    if (error) throw AppError.fromSupabase(error, "platform_settings");
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  async saveSetting(key: string, value: unknown): Promise<void> {
    const { data, error } = await supabase
      .from("platform_settings" as never)
      .update({ value } as never)
      .eq("key", key)
      .select("key");
    if (error) throw AppError.fromSupabase(error, "platform_settings.save");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `settings.manage` capability.",
      );
    }
  }

  // ── Provisioning (Phase 4) ───────────────────────────────────────────────
  async provisioningQueue(): Promise<{
    counts: Record<string, number> | null;
    median_duration_ms: number | null;
    jobs: Record<string, unknown>[] | null;
  } | null> {
    const { data, error } = await supabase.rpc("provisioning_queue" as never);
    if (error) throw AppError.fromSupabase(error, "provisioning_queue");
    return (data as never) ?? null;
  }

  async provisioningProgress(orgId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc("provisioning_progress" as never, {
      _org: orgId,
    } as never);
    if (error) throw AppError.fromSupabase(error, "provisioning_progress");
    return (data as never) ?? null;
  }

  async runProvisioningWorker(maxJobs = 10): Promise<{ processed: number }> {
    const { data, error } = await supabase.functions.invoke("provisioning-worker", {
      body: { maxJobs },
    });
    if (error) throw AppError.validation(error.message);
    return data as { processed: number };
  }

  async retryProvisioningJob(jobId: string): Promise<void> {
    const { error } = await supabase.rpc("retry_provisioning_job" as never, {
      _job: jobId,
    } as never);
    if (error) throw AppError.fromSupabase(error, "retry_provisioning_job");
  }

  async rollbackProvisioningJob(jobId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc("rollback_provisioning_job" as never, {
      _job: jobId,
    } as never);
    // The refusal message names exactly why (live students/staff), which is
    // far more useful to an operator than "rollback failed".
    if (error) throw AppError.validation(error.message);
    return data;
  }

  // ── Module entitlements (Phase 9A) ───────────────────────────────────────
  //
  // Reads return LAYERS, not answers. `resolveEntitlements` in
  // features/platform/modules/entitlements.ts is the only place precedence is
  // decided, and the tenant's sidebar runs that same function — see the header
  // there for why a second SQL implementation was rejected.

  async entitlementLayers(orgId: string): Promise<EntitlementLayers | null> {
    const { data, error } = await supabase.rpc("platform_entitlement_layers" as never, {
      _org: orgId,
    } as never);
    if (error) throw AppError.fromSupabase(error, "platform_entitlement_layers");
    return (data as unknown as EntitlementLayers) ?? null;
  }

  async moduleMatrix(): Promise<MatrixRow[]> {
    const { data, error } = await supabase.rpc("platform_module_matrix" as never);
    if (error) throw AppError.fromSupabase(error, "platform_module_matrix");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), slug: String(r.slug), displayName: String(r.display_name),
      status: String(r.status), protected: Boolean(r.protected),
      layers: r.layers as unknown as EntitlementLayers,
    }));
  }

  async moduleGovernance(): Promise<ModuleGovernance[]> {
    const { data, error } = await supabase
      .from("platform_module_governance" as never)
      .select("module_key, is_globally_available, default_enabled, note, updated_at");
    if (error) throw AppError.fromSupabase(error, "platform_module_governance");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      moduleKey: String(r.module_key),
      isGloballyAvailable: Boolean(r.is_globally_available),
      defaultEnabled:
        r.default_enabled === null || r.default_enabled === undefined
          ? null
          : Boolean(r.default_enabled),
      note: str(r.note), updatedAt: str(r.updated_at),
    }));
  }

  setModule(input: {
    organizationId: string; moduleKey: string; enabled: boolean;
    reason?: string; expiresAt?: string | null; note?: string;
  }) {
    return invokePlatform<{ ok: boolean; changed: boolean }>("set_module", input);
  }

  clearModuleOverride(organizationId: string, moduleKey: string) {
    return invokePlatform<{ ok: boolean; removed: boolean }>("clear_module_override", {
      organizationId, moduleKey,
    });
  }

  bulkModules(input: {
    organizationIds: string[]; moduleKey: string; enabled: boolean;
    note: string; reason?: string; expiresAt?: string | null;
  }) {
    return invokePlatform<{
      ok: boolean; batchId: string;
      results: { organizationId: string; ok: boolean; skipped?: string; changed?: boolean }[];
    }>("bulk_modules", input);
  }

  setModuleGovernance(moduleKey: string, available: boolean, note?: string) {
    return invokePlatform<{ ok: boolean }>("set_module_governance", { moduleKey, available, note });
  }

  /**
   * The platform's standing decision for a feature — every organization that
   * has no opinion of its own follows it, INCLUDING ones created later.
   *
   * `enabled: null` clears the default. `applyToExisting` (default true) also
   * removes the per-organization overrides that contradict it, so the current
   * fleet follows the platform too; protected organizations are skipped.
   */
  setFeatureDefault(input: {
    featureKey: string;
    enabled: boolean | null;
    note?: string;
    applyToExisting?: boolean;
  }) {
    return invokePlatform<{
      ok: boolean; changed: boolean;
      cleared: { cleared: number; protected_skipped: number } | null;
    }>("set_feature_default", input);
  }

  // ── Organization lifecycle (Phase 9A) ────────────────────────────────────

  setLifecycle(input: {
    organizationId: string; status: string; reason: string;
    acknowledgeProtected?: boolean;
  }) {
    return invokePlatform<{ ok: boolean; changed: boolean; from?: string }>("set_status", input);
  }

  updateOrganizationProfile(input: {
    organizationId: string; patch: Record<string, string | null>;
    expectedUpdatedAt?: string | null;
  }) {
    return invokePlatform<{ ok: boolean }>("update_organization_profile", input);
  }

  requestDelete(input: { organizationId: string; reason: string; confirmSlug: string }) {
    return invokePlatform<{ ok: boolean; requestId: string; created: boolean }>(
      "request_delete", input,
    );
  }

  reviewDelete(input: { requestId: string; decision: "approved" | "cancelled"; note?: string }) {
    return invokePlatform<{ ok: boolean; changed: boolean }>("review_delete", input);
  }

  /**
   * Preview or execute an irreversible erasure.
   *
   * `dryRun: true` (the default everywhere it is called for a preview) counts
   * rows per table and changes nothing. The destructive call additionally
   * requires the typed slug, which the edge function re-verifies server-side —
   * the client-side check is a courtesy, this is the control.
   */
  purgeOrganization(input: {
    organizationId: string;
    requestId: string;
    dryRun: boolean;
    confirmSlug?: string;
  }) {
    return invokePlatform<PurgeReport>("purge_organization", input);
  }

  async deleteRequests(): Promise<DeleteRequest[]> {
    const { data, error } = await supabase
      .from("organization_delete_requests" as never)
      .select("id, organization_id, organization_slug, status, reason, requested_email, requested_at, eligible_at, reviewed_at, review_note")
      .order("requested_at", { ascending: false });
    if (error) throw AppError.fromSupabase(error, "organization_delete_requests");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), organizationId: String(r.organization_id),
      organizationSlug: String(r.organization_slug), status: String(r.status),
      reason: String(r.reason), requestedEmail: str(r.requested_email),
      requestedAt: String(r.requested_at), eligibleAt: String(r.eligible_at),
      reviewedAt: str(r.reviewed_at), reviewNote: str(r.review_note),
    }));
  }

  async protections(): Promise<Set<string>> {
    const { data, error } = await supabase
      .from("organization_protections" as never)
      .select("organization_id, is_protected");
    // A missing protections table (migration not yet applied) must not blank
    // the organizations list — but it MUST NOT quietly report "nothing is
    // protected" either, since the UI would then offer to suspend ARK. Throwing
    // is the honest option; the caller surfaces it.
    if (error) throw AppError.fromSupabase(error, "organization_protections");
    return new Set(
      ((data ?? []) as unknown as Record<string, unknown>[])
        .filter((r) => r.is_protected)
        .map((r) => String(r.organization_id)),
    );
  }

  // ── Platform users ───────────────────────────────────────────────────────
  async platformUsers(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from("platform_users" as never)
      .select("id, email, name, role, is_active, mfa_enrolled, last_login_at, created_at")
      .order("created_at");
    if (error) throw AppError.fromSupabase(error, "platform_users");
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  invitePlatformUser(input: { email: string; name: string; role: string }) {
    return invokePlatform<{ ok: boolean; userId: string; note: string }>(
      "invite_platform_user", input,
    );
  }

  // ── Invoices ─────────────────────────────────────────────────────────────
  //
  // Every write goes through `issue_invoice()`. Inserting a row here directly
  // would draw no number from `invoice_sequences`, and a hand-written number is
  // exactly the gap GST forbids — so the client has no INSERT path at all.

  async invoices(): Promise<PlatformInvoice[]> {
    const { data, error } = await supabase
      .from("invoices" as never)
      .select(
        "id, organization_id, subscription_id, invoice_number, status, currency, " +
          "subtotal, discount_total, tax_total, total, cgst, sgst, igst, " +
          "gst_treatment, place_of_supply, gstin, financial_year, " +
          "period_start, period_end, issued_at, due_at, paid_at, notes, " +
          "provider, provider_payment_id, pdf_path, emailed_at, created_at, " +
          "organizations(slug, display_name, legal_name)",
      )
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw AppError.fromSupabase(error, "invoices");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toInvoice);
  }

  /** The lines of one invoice, in print order. */
  async invoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
    const { data, error } = await supabase
      .from("invoice_lines" as never)
      .select("id, description, quantity, unit_amount, amount, tax_percent, hsn_sac, sort_order")
      .eq("invoice_id", invoiceId)
      .order("sort_order");
    if (error) throw AppError.fromSupabase(error, "invoice_lines");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      description: String(r.description),
      quantity: num(r.quantity, 1),
      unitAmount: num(r.unit_amount),
      amount: num(r.amount),
      taxPercent: num(r.tax_percent),
      hsnSac: str(r.hsn_sac),
    }));
  }

  /**
   * The counter behind the numbers.
   *
   * Read so the console can PROVE the sequence rather than assert it: one row
   * per (organization, financial year), and `lastNumber` must equal the count
   * of invoices issued under it. A mismatch is the only evidence a gap exists,
   * and a gap is a statutory problem.
   */
  async invoiceSequences(): Promise<InvoiceSequence[]> {
    const { data, error } = await supabase
      .from("invoice_sequences" as never)
      .select("organization_id, financial_year, prefix, last_number")
      .order("financial_year", { ascending: false });
    if (error) throw AppError.fromSupabase(error, "invoice_sequences");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      organizationId: String(r.organization_id),
      financialYear: String(r.financial_year),
      prefix: String(r.prefix),
      lastNumber: num(r.last_number),
    }));
  }

  /**
   * Draw a number and write the invoice, inside the database.
   *
   * `_amount` is optional: omitted, the function bills the subscription's own
   * amount less its discount. Passing one is for the genuine exception (a
   * pro-rated upgrade, an agreed adjustment), not the normal path.
   */
  async issueInvoice(input: {
    organizationId: string;
    subscriptionId?: string | null;
    amount?: number | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    description?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc("issue_invoice" as never, {
      _org: input.organizationId,
      _subscription: input.subscriptionId ?? null,
      _amount: input.amount ?? null,
      _period_start: input.periodStart ?? null,
      _period_end: input.periodEnd ?? null,
      _payment_id: null,
      _description: input.description ?? null,
    } as never);
    if (error) throw AppError.fromSupabase(error, "issue_invoice");
    return String(data);
  }

  /**
   * Move an issued invoice between statuses.
   *
   * Deliberately no delete and no renumber. An issued invoice is a statutory
   * record: the correction for a wrong one is `void` plus a fresh invoice,
   * which leaves both numbers in the sequence and both facts on the ledger.
   * Deleting it would open the gap the numbering design exists to prevent.
   */
  async setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    // `paid_at` is the date the money arrived, so it is set when the status
    // says so and cleared when that is walked back — otherwise a voided
    // invoice keeps a payment date and reads as collected.
    if (status === "paid") patch.paid_at = new Date().toISOString();
    if (status === "void" || status === "issued") patch.paid_at = null;

    const { data, error } = await supabase
      .from("invoices" as never)
      .update(patch as never)
      .eq("id", id)
      .select("id");
    if (error) throw AppError.fromSupabase(error, "invoices.status");
    if (!data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `billing.manage` capability.",
      );
    }
  }

  // ── Backups & disaster recovery ──────────────────────────────────────────
  //
  // Policy and the rehearsal register live in `platform_settings`, which
  // already exists with the right policy (`platform_can('settings.manage')`).
  // A dozen rehearsal records a year did not justify a table, and a table
  // shipped as an unapplied migration would have meant a register that did not
  // work at all.

  /**
   * Write one `platform_settings` row, creating it if it is not seeded yet.
   *
   * Deliberately update-then-insert rather than a named upsert. Two reasons,
   * and the second is the one that matters:
   *
   *   1. It separates outcomes an upsert conflates — a row that does not exist
   *      yet (normal, nothing seeds these) from a caller who may not write
   *      (worth naming).
   *   2. `platform_settings` is keyed on its key column alone, correctly, as a
   *      control-plane table with no tenant. `system_settings` had the same
   *      single-column key widened to include organization_id in Phase 1E, and
   *      the build gate keeping call sites in step with that conversion matches
   *      on the COLUMN SET, not the table. It cannot tell the two apart, so the
   *      literal conflict target here reads to it as the exact regression it
   *      exists to catch. Weakening that gate to admit a false positive would
   *      cost more than this does.
   *
   * Both statements ask for their rows back: an RLS-filtered write returns 204
   * with a null error, so without that an unauthorised save reports success.
   */
  private async writePlatformSetting(key: string, value: unknown): Promise<void> {
    const patch = { value, updated_at: new Date().toISOString() };

    const updated = await supabase
      .from("platform_settings" as never)
      .update(patch as never)
      .eq("key", key)
      .select("key");
    if (updated.error) throw AppError.fromSupabase(updated.error, `platform_settings.${key}`);
    if (updated.data?.length) return;

    const inserted = await supabase
      .from("platform_settings" as never)
      .insert({ key, ...patch } as never)
      .select("key");
    if (inserted.error) throw AppError.fromSupabase(inserted.error, `platform_settings.${key}`);
    if (!inserted.data?.length) {
      throw AppError.validation(
        "Nothing was saved — your platform role lacks the `settings.manage` capability.",
      );
    }
  }

  async drPolicy(): Promise<DrPolicy> {
    const { data, error } = await supabase
      .from("platform_settings" as never)
      .select("value")
      .eq("key", DR_POLICY_KEY)
      .maybeSingle();
    if (error) throw AppError.fromSupabase(error, "platform_settings.dr_policy");
    const v = ((data as { value?: unknown } | null)?.value ?? {}) as Record<string, unknown>;
    return {
      rpoMinutes: num(v.rpo_minutes, DR_DEFAULTS.rpoMinutes),
      rtoHours: num(v.rto_hours, DR_DEFAULTS.rtoHours),
      pitrRetentionDays: num(v.pitr_retention_days, DR_DEFAULTS.pitrRetentionDays),
      rehearsalIntervalDays: num(v.rehearsal_interval_days, DR_DEFAULTS.rehearsalIntervalDays),
      exportRetentionDays: num(v.export_retention_days, DR_DEFAULTS.exportRetentionDays),
    };
  }

  async saveDrPolicy(p: DrPolicy): Promise<void> {
    await this.writePlatformSetting(DR_POLICY_KEY, {
      rpo_minutes: p.rpoMinutes,
      rto_hours: p.rtoHours,
      pitr_retention_days: p.pitrRetentionDays,
      rehearsal_interval_days: p.rehearsalIntervalDays,
      export_retention_days: p.exportRetentionDays,
    });
  }

  async drRehearsals(): Promise<DrRehearsal[]> {
    const { data, error } = await supabase
      .from("platform_settings" as never)
      .select("value")
      .eq("key", DR_REHEARSALS_KEY)
      .maybeSingle();
    if (error) throw AppError.fromSupabase(error, "platform_settings.dr_rehearsals");
    const v = (data as { value?: unknown } | null)?.value as Record<string, unknown> | undefined;
    const rows = Array.isArray(v?.entries) ? (v!.entries as Record<string, unknown>[]) : [];
    return rows
      .map((r) => ({
        id: String(r.id ?? ""),
        performedAt: String(r.performed_at ?? ""),
        performedBy: String(r.performed_by ?? ""),
        restoredTo: str(r.restored_to),
        outcome: (String(r.outcome ?? "pass") === "fail" ? "fail" : "pass") as DrOutcome,
        minutesToRestore: r.minutes_to_restore == null ? null : num(r.minutes_to_restore),
        notes: str(r.notes),
      }))
      .filter((r) => r.id && r.performedAt)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }

  /**
   * Append one rehearsal record.
   *
   * Read-modify-write on a jsonb array, so it is NOT safe against two people
   * recording a rehearsal in the same second — the loser would be silently
   * dropped. Accepted deliberately: this is a monthly, single-operator ritual,
   * and the alternative was a table that would have shipped unapplied. If
   * rehearsals ever become concurrent, this is the thing to promote to a table.
   */
  async recordDrRehearsal(entry: Omit<DrRehearsal, "id">): Promise<void> {
    const existing = await this.drRehearsals();
    const next = [
      ...existing,
      {
        id: crypto.randomUUID(),
        performed_at: entry.performedAt,
        performed_by: entry.performedBy,
        restored_to: entry.restoredTo,
        outcome: entry.outcome,
        minutes_to_restore: entry.minutesToRestore,
        notes: entry.notes,
      },
    ];
    await this.writePlatformSetting(DR_REHEARSALS_KEY, { entries: next });
  }

  /**
   * Export one organization's rows.
   *
   * Service-role only, and read-only by construction: the edge function calls a
   * SECURITY DEFINER function declared STABLE, so Postgres itself rejects any
   * write inside it. `dryRun` returns the table/row manifest without the data,
   * which is what the console shows before anyone downloads a tenant's entire
   * database.
   */
  exportOrganization(input: { organizationId: string; dryRun?: boolean }) {
    return invokePlatform<OrganizationExport>("export_organization", {
      organizationId: input.organizationId,
      dryRun: input.dryRun !== false,
    });
  }
}

export const platformService = new PlatformService();
