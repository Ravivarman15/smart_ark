// ──────────────────────────────────────────────────────────────────────────────
// PLAN SERVICE
//
// ┌── WHAT THIS USED TO DO ────────────────────────────────────────────────┐
// │ It returned a hardcoded "ARK Pro" plan with invented limits — 50 staff,│
// │ 2,000 students, 5,000 MB, 5,000 SMS — and a synthetic validity window  │
// │ running Jan 1 to Jan 1. None of it came from anywhere. The comment     │
// │ said "swap the body when the real subscription table lands".           │
// │                                                                        │
// │ It landed in Phase 2C. `subscriptions` and `plans` are live and        │
// │ populated, so this now reads them.                                     │
// └────────────────────────────────────────────────────────────────────────┘
//
// Entitlements come from the PLAN; consumption is counted live. Both are
// scoped by RLS to the caller's organization — no organization_id is passed,
// because current_org_id() already filters every query and passing one would
// be a second, weaker check that could disagree.
//
// NULL limits mean UNLIMITED throughout, matching the plans table, which is why
// every limit here is `number | undefined` rather than a sentinel like -1 that
// each consumer would have to remember to special-case.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import type { PlanSummary } from "../types/settings.types";

interface PlanRow {
  code: string;
  name: string;
  support_level: string | null;
  max_students: number | null;
  max_staff: number | null;
  max_branches: number | null;
  max_storage_mb: number | null;
  whatsapp_credits: number | null;
  email_credits: number | null;
  allow_white_label: boolean | null;
  allow_custom_domain: boolean | null;
  allow_marketplace: boolean | null;
}

interface SubscriptionRow {
  status: string;
  interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plans: PlanRow | PlanRow[] | null;
}

/** PostgREST returns an embedded to-one as an object or a 1-element array. */
const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

const nn = (v: number | null | undefined): number | undefined =>
  v === null || v === undefined ? undefined : Number(v);

/**
 * subscriptions.status → the four states the settings UI renders.
 *
 * past_due and grace map to ACTIVE. They are subscriptions being chased for
 * payment, not dead ones — the customer keeps working throughout, and showing
 * "expired" would tell a paying institution their system is off while it
 * plainly is not.
 *
 * Membership sets rather than a switch with fallthrough: the grouping is the
 * whole point of this function, and a set states it directly instead of
 * relying on the reader noticing an absent `break`.
 */
const WORKING = new Set(["active", "past_due", "grace"]);
const ENDED = new Set(["suspended", "cancelled"]);

function toUiStatus(dbStatus: string): PlanSummary["status"] {
  if (dbStatus === "trialing") return "trial";
  if (WORKING.has(dbStatus)) return "active";
  if (ENDED.has(dbStatus)) return "expired";
  return "unknown";
}

/**
 * Human-readable entitlements, derived from the plan row.
 *
 * Generated rather than stored so the list cannot contradict the limits shown
 * directly beneath it — the previous hardcoded list claimed "Unlimited
 * students" next to a 2,000 student cap.
 */
function featuresFor(plan: PlanRow): string[] {
  const out: string[] = [];
  const cap = (n: number | null, singular: string) =>
    n === null ? `Unlimited ${singular}` : `Up to ${n.toLocaleString("en-IN")} ${singular}`;

  out.push(cap(plan.max_students, "students"));
  out.push(cap(plan.max_staff, "staff accounts"));
  if (plan.max_branches === null) out.push("Unlimited branches");
  else if (plan.max_branches > 1) out.push(`${plan.max_branches} branches`);
  else out.push("Single branch");

  if (plan.whatsapp_credits === null) out.push("Unlimited WhatsApp messages");
  else if (plan.whatsapp_credits > 0) {
    out.push(`${plan.whatsapp_credits.toLocaleString("en-IN")} WhatsApp credits`);
  }

  if (plan.allow_white_label) out.push("White-label branding");
  if (plan.allow_custom_domain) out.push("Custom domain");
  if (plan.allow_marketplace) out.push("Marketplace apps");

  if (plan.support_level) {
    const label: Record<string, string> = {
      community: "Community support",
      email: "Email support",
      priority: "Priority support",
      sla: "SLA-backed support",
    };
    out.push(label[plan.support_level] ?? `${plan.support_level} support`);
  }
  return out;
}

class PlanService extends BaseService {
  async summary(): Promise<PlanSummary> {
    const [subRes, studentsRes, staffRes, metricsRes] = await Promise.all([
      // Newest first: a re-subscribed organization has more than one row, and
      // the current one is what the page is about.
      this.db
        .from("subscriptions" as never)
        .select(
          "status, interval, current_period_start, current_period_end, trial_ends_at, " +
            "plans(code, name, support_level, max_students, max_staff, max_branches, " +
            "max_storage_mb, whatsapp_credits, email_credits, allow_white_label, " +
            "allow_custom_domain, allow_marketplace)",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.db.from("students").select("id", { count: "exact", head: true }),
      this.db.from("profiles").select("id", { count: "exact", head: true }),
      // Storage comes from the nightly rollup rather than a live sum: totalling
      // object sizes across every bucket on a settings page render would be an
      // expensive query for a number that changes slowly.
      this.db
        .from("organization_metrics_daily" as never)
        .select("storage_bytes, metric_date")
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const staffUsed = staffRes.count ?? 0;
    const studentUsed = studentsRes.count ?? 0;

    // Absent until the rollup has run at least once. Left undefined rather than
    // defaulted to 0 — the UI distinguishes "nothing stored" from "not measured
    // yet", and showing 0 MB against a real 400 MB would be worse than a dash.
    const storageBytes = metricsRes.error
      ? null
      : (metricsRes.data as { storage_bytes?: number | null } | null)?.storage_bytes ?? null;
    const storageUsedMb =
      storageBytes === null ? undefined : Math.round(Number(storageBytes) / 1_048_576);

    const sub = subRes.error ? null : (subRes.data as unknown as SubscriptionRow | null);
    const plan = sub ? one(sub.plans) : null;

    // An organization with no subscription row is a real state, not an error:
    // it is exactly what a tenant provisioned before billing was wired looks
    // like. Say so, and still show the live counts — inventing a plan name
    // here is how the page ended up lying in the first place.
    if (!sub || !plan) {
      return {
        planName: "No active plan",
        status: "unknown",
        features: [],
        staffUsed,
        studentUsed,
        storageUsedMb,
      };
    }

    return {
      planName: plan.name,
      status: toUiStatus(sub.status),
      // A trialing subscription has no billing period yet; its meaningful end
      // date is when the trial runs out.
      startsAt: sub.current_period_start ?? undefined,
      expiresAt: sub.current_period_end ?? sub.trial_ends_at ?? undefined,
      features: featuresFor(plan),
      staffLimit: nn(plan.max_staff),
      staffUsed,
      studentLimit: nn(plan.max_students),
      studentUsed,
      storageLimitMb: nn(plan.max_storage_mb),
      storageUsedMb,
      smsLimit: nn(plan.whatsapp_credits),
      smsUsed: undefined, // Counted on the SMS Plan page, which owns messaging.
    };
  }
}

export const planService = new PlanService();
