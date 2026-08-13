// ─────────────────────────────────────────────────────────────────────────────
// comms-scheduler — daily cron entrypoint for scheduled event automation.
//
// ┌── WHY THIS WAS REWRITTEN ──────────────────────────────────────────────┐
// │ The previous version had never enqueued a single row. Verified against │
// │ production on 2026-08-12: zero `birthday_student` / `demo_reminder`    │
// │ rows have ever existed in message_queue. Five independent faults, each │
// │ sufficient on its own:                                                 │
// │                                                                        │
// │  1. NO CRON. The pg_cron block in 20260628_comms_automation.sql is     │
// │     commented out and was never enabled, so nothing ever invoked it.   │
// │  2. message_queue.organization_id is NOT NULL DEFAULT current_org_id(),│
// │     and this function runs as service_role with no JWT. Once a second  │
// │     organization existed, fallback_org_id() began returning NULL and   │
// │     every insert violated the not-null constraint. `enqueue()` returned│
// │     0 on error and the response still said ok:true.                    │
// │  3. Rows carried no `__body`, and send-aisensy permanently fails those │
// │     as "empty body".                                                   │
// │  4. Settings from every tenant were collapsed into one Map keyed by    │
// │     event_key, so whichever organization sorted last decided whether   │
// │     the OTHER organization's automation ran.                           │
// │  5. Every query was unscoped under service_role, which bypasses RLS —  │
// │     so ARK students could be queued against ABC's settings.            │
// │                                                                        │
// │ Plus: only 2 of the 6 scheduled events were implemented at all, the    │
// │ day boundary was UTC rather than the tenant's timezone, and quiet      │
// │ hours and communication preference were not consulted.                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// THE SHAPE NOW: one explicit pass PER ORGANIZATION. Every query filters on
// that organization's id, every inserted row carries it explicitly, and the
// tenant's own timezone decides what "today" means. No cross-tenant Map.
//
// It still creates no second engine: it writes message_queue rows in the exact
// shape aisensyService writes them, and the existing send-aisensy drainer,
// retry and webhook do the rest.
//
//   POST { }                  → run for every active organization
//   POST { dryRun: true }     → resolve and render, write NOTHING
//   POST { organizationId }   → restrict to one tenant
//   POST { date: "2026-08-12" } → run as if it were that date
//
// WHO MAY CALL IT: the service role key (cron and operator tooling) for
// anything; a signed-in user for a DRY RUN of their OWN organization only.
// The anonymous key is refused outright — it ships in the frontend bundle, and
// a dry run returns real recipients' names.
//
// Deploy: supabase functions deploy comms-scheduler
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import TEMPLATES from "../_shared/commsTemplates.json" with { type: "json" };
import { resolveCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
type Db = any;

interface TemplateDef {
  key: string;
  title: string;
  body: string;
  variables: string[];
}

const CANONICAL = TEMPLATES as {
  templates: Record<string, TemplateDef>;
  eventTemplateKeys: Record<string, string>;
};

interface Setting {
  event_key: string;
  enabled: boolean;
  channel: string;
  timing: string;
  template_key: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
}

interface Org {
  id: string;
  slug: string;
  timezone: string | null;
  display_name: string | null;
  legal_name: string | null;
}

/**
 * Why a candidate did not become a message. Counted rather than discarded, so
 * a dry run can say "128 students, 4 opted out, 1 has no phone" instead of
 * "123 recipients" and leaving the operator to wonder about the other five.
 */
interface SkipStats {
  candidates: number;
  preferenceSkipped: number;
  missingPhone: number;
  missingData: number;
}

const newStats = (): SkipStats => ({
  candidates: 0, preferenceSkipped: 0, missingPhone: 0, missingData: 0,
});

/**
 * The idempotency key.
 *
 * organization_id is the row's own column; this is the rest:
 *   event_key + entity + the tenant's LOCAL date
 *
 * The local date is part of the key rather than left to a `created_at::date`
 * filter, because those two disagree for 5.5 hours a day in Asia/Kolkata — a
 * run at 02:00 IST and one at 08:00 IST are the same local day but different
 * UTC days, and would each send.
 */
function idempotencyKey(entityId: string, localDate: string): string {
  return `${entityId}:${localDate}`;
}

/** One resolved message, before it becomes a queue row. */
interface Draft {
  eventKey: string;
  contextId: string;
  name: string;
  phone: string;
  studentId?: string;
  vars: Record<string, string>;
}

// ── Failure classification ──────────────────────────────────────────────────
//
// The old scheduler had one failure mode: swallow it and return ok:true. Every
// failure now lands in one of these buckets, is attached to the organization
// and event it belongs to, and never changes the overall shape of the response
// into a false success.
type FailureKind =
  | "VALIDATION_ERROR"
  | "TENANT_CONTEXT_ERROR"
  | "TEMPLATE_ERROR"
  | "RECIPIENT_ERROR"
  | "PROVIDER_ERROR"
  | "DATABASE_ERROR"
  | "CONFIGURATION_ERROR"
  | "RATE_LIMIT"
  | "UNKNOWN";

/**
 * Map a raw error onto the taxonomy.
 *
 * Deliberately conservative: anything unrecognised stays UNKNOWN rather than
 * being filed under a plausible-looking category. A misfiled error is harder to
 * debug than an unfiled one.
 */
function classify(message: string): FailureKind {
  const m = message.toLowerCase();
  if (m.includes("organization_id") && m.includes("not-null")) return "TENANT_CONTEXT_ERROR";
  if (m.includes("current_org_id") || m.includes("tenant")) return "TENANT_CONTEXT_ERROR";
  if (m.includes("no template") || m.includes("template")) return "TEMPLATE_ERROR";
  if (m.includes("blocked:")) return "CONFIGURATION_ERROR";
  if (m.includes("rate limit") || m.includes("429")) return "RATE_LIMIT";
  if (m.includes("permission denied") || m.includes("violates") || m.includes("constraint")
      || m.includes("relation") || m.includes("column") || m.includes("embed")) return "DATABASE_ERROR";
  if (m.includes("recipient") || m.includes("phone")) return "RECIPIENT_ERROR";
  if (m.includes("provider") || m.includes("aisensy")) return "PROVIDER_ERROR";
  return "UNKNOWN";
}

// ── Time ────────────────────────────────────────────────────────────────────

/**
 * "Today" in the ORGANIZATION's timezone, not the server's.
 *
 * A birthday greeting is a wall-clock concept. The old code used
 * toISOString(), i.e. UTC, so for an Asia/Kolkata school every run between
 * 00:00 and 05:30 local time asked for the wrong day — and the birthdays of
 * anyone born on the 1st were looked up on the last day of the previous month.
 */
function localDate(tz: string, base = new Date()): string {
  try {
    // en-CA renders ISO-ordered yyyy-mm-dd, which is the whole reason it is
    // used here rather than a manual offset calculation that would have to
    // know about daylight saving.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(base);
  } catch {
    return base.toISOString().slice(0, 10);
  }
}

/**
 * The tenant's timezone, with the deployment's own default when the column is
 * unset. Centralised because "which day is it" is decided in several places
 * and two different fallbacks would put the same organization on two days.
 */
const DEFAULT_TZ = "Asia/Kolkata";
const tzOf = (o: { timezone: string | null }): string => o.timezone || DEFAULT_TZ;

function localHHMM(tz: string, base = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(base);
  } catch {
    return base.toISOString().slice(11, 16);
  }
}

/**
 * Unwrap a PostgREST result, THROWING on error.
 *
 * ┌── WHY THIS EXISTS ────────────────────────────────────────────────────┐
 * │ The first version of these resolvers wrote `const { data } = await …` │
 * │ and ignored `error`. A dry run then reported fee_due → 0 recipients   │
 * │ while the database held 126 qualifying rows: an unknown column in an  │
 * │ embed answers 42703, `data` comes back null, and "query failed" is    │
 * │ indistinguishable from "nobody is due". That is the same class of     │
 * │ silent-zero bug this whole rewrite exists to remove, reintroduced in  │
 * │ the rewrite itself. A throw here surfaces as a per-event `reason` in  │
 * │ the response rather than a comforting 0.                              │
 * └───────────────────────────────────────────────────────────────────────┘
 */
// deno-lint-ignore no-explicit-any
function rows(res: { data: any; error: { message?: string } | null }, what: string): any[] {
  if (res.error) throw new Error(`${what}: ${res.error.message ?? "query failed"}`);
  return res.data ?? [];
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Quiet hours, supporting a window that crosses midnight (22:00 → 07:00).
 * Mirrors isWithinQuietHours() in src/.../automationRules.ts.
 */
function inQuietHours(now: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  return s <= e ? now >= s && now < e : now >= s || now < e;
}

// ── Rendering ───────────────────────────────────────────────────────────────

/**
 * Substitute {{var}} placeholders. An unresolved placeholder is reported so the
 * caller can SKIP the message rather than send "Class  - " to a parent.
 */
function render(body: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === "") {
      missing.push(name);
      return "";
    }
    return String(v);
  });
  return { text, missing };
}

// ── Caller identity ─────────────────────────────────────────────────────────

type Caller =
  | { kind: "service"; organizationId: null }
  | { kind: "user"; organizationId: string | null }
  | { kind: "anonymous"; organizationId: null };

/**
 * Who is calling.
 *
 * The token's SIGNATURE is verified by resolveCaller(), which round-trips to
 * GoTrue — not by decoding the payload here. Locally parsing a JWT would be
 * safe only while config.toml keeps verify_jwt = true, i.e. the safety would
 * live in a config file rather than in this function, and a service-role
 * function that gets its tenant from a forgeable claim is cross-tenant access.
 * The Phase 0 gate (S6) fails the build on any local decode, which is how this
 * was caught.
 *
 * The organization likewise comes from `organization_users` membership, not
 * from a claim and never from the request body.
 */
async function identify(req: Request, db: Db): Promise<Caller> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { kind: "anonymous", organizationId: null };

  // Fast path: the exact key this deployment was given. Compared as an opaque
  // string — no parsing, nothing to forge, and never a value a browser holds.
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { kind: "service", organizationId: null };
  }

  // A real, currently-valid user session. The anon publishable key fails here,
  // which is the point: it ships in the frontend bundle.
  const caller = await resolveCaller(req, db);
  if (caller) return { kind: "user", organizationId: caller.organizationId };

  // Not that key, and not a user. It may still be a service credential: a
  // project can hold BOTH the legacy service_role JWT and a newer sb_secret_
  // key, and only one of them is in this function's environment. So the last
  // question is not "which string is it" but "what may it do" — asked by
  // attempting an operation no anon key and no user token can perform. A
  // wrong guess here fails closed: the probe errors and the caller is nobody.
  if (await grantsServiceRole(token)) return { kind: "service", organizationId: null };

  return { kind: "anonymous", organizationId: null };
}

async function grantsServiceRole(token: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return false;
  try {
    const probe = createClient(url, token, { auth: { persistSession: false } });
    // Listing auth users is service-role-only. An anon key, an expired token
    // and a signed-in user's JWT all fail it.
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase: Db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dryRun === true;
    const forcedDate: string | null = body?.date ?? null;

    // ── CALLER IDENTITY ──────────────────────────────────────────────────
    //
    // ┌── THE HOLE THIS CLOSES ────────────────────────────────────────┐
    // │ This function queries as service_role, which bypasses RLS, and │
    // │ it took the target tenant from `organizationId` IN THE REQUEST │
    // │ BODY. Two consequences, both live:                             │
    // │                                                                │
    // │  · An authenticated ABC admin could post ARK's organization id │
    // │    and read back ARK parents' names in the dry-run output.     │
    // │  · The gateway accepts the ANON key, which is compiled into    │
    // │    the shipped frontend bundle — so the leak was not even      │
    // │    limited to customers.                                       │
    // │                                                                │
    // │ Tenant identity is therefore taken from the VERIFIED JWT's     │
    // │ app_metadata (server-issued, matching jwt_org_id() in SQL) and │
    // │ never from the body. A body id is now only a filter that must  │
    // │ AGREE with the claim — it can narrow a run, never redirect it. │
    // └────────────────────────────────────────────────────────────────┘
    const caller = await identify(req, supabase);
    if (caller.kind === "anonymous") {
      return json(401, {
        error:
          "comms-scheduler requires a signed-in user or the service role key. " +
          "The anonymous key ships in the frontend bundle and cannot be trusted with tenant data.",
      });
    }

    const requestedOrg: string | null = body?.organizationId ?? null;
    let onlyOrg: string | null = requestedOrg;

    if (caller.kind === "user") {
      if (!caller.organizationId) {
        return json(403, {
          error: "Your session carries no organization claim, so no tenant can be resolved for it.",
        });
      }
      if (requestedOrg && requestedOrg !== caller.organizationId) {
        // Not silently corrected to the caller's own org: a request to run
        // somebody else's tenant is an attempt worth refusing loudly.
        return json(403, { error: "organizationId does not match your session's organization." });
      }
      onlyOrg = caller.organizationId;
      // A tenant user may inspect their own automations; they may not start
      // real traffic. Only the cron (service role) sends.
      if (!dryRun) {
        return json(403, {
          error: "Only the scheduled job may perform a live run. Use dryRun: true.",
        });
      }
    }

    // `events` force-resolves specific automations regardless of whether the
    // tenant has enabled them. It is accepted ONLY together with dryRun,
    // because the entire purpose of the enabled flag is that a school decides
    // who gets messaged — a flag that a request body could override would not
    // be a setting at all. This exists so an operator can validate a resolver
    // against real data without switching a live automation on.
    const forcedEvents: string[] | null =
      dryRun && Array.isArray(body?.events) && body.events.length > 0
        ? body.events.map(String)
        : null;
    if (!dryRun && body?.events) {
      return json(400, { error: "`events` may only be used with dryRun: true" });
    }

    // Only organizations that are actually live get messaged. A suspended or
    // archived tenant sending birthday wishes to parents would be a support
    // incident, not a feature.
    let orgQuery = supabase
      .from("organizations")
      .select("id, slug, timezone, display_name, legal_name")
      .in("status", ["active", "trialing", "past_due"]);
    if (onlyOrg) orgQuery = orgQuery.eq("id", onlyOrg);

    const { data: orgRows, error: orgErr } = await orgQuery;
    if (orgErr) {
      return json(500, { error: `organizations: ${orgErr.message}` });
    }

    const report: Record<string, unknown>[] = [];

    // ── PER-ORGANIZATION ISOLATION ───────────────────────────────────────
    // One tenant's failure must never stop the others. A thrown error here
    // used to abort the whole run, so a single malformed setting row could
    // silence every school on the platform.
    let failedOrgs = 0;
    for (const org of (orgRows ?? []) as Org[]) {
      try {
        report.push(await runForOrg(supabase, org, { dryRun, forcedDate, forcedEvents }));
      } catch (e) {
        failedOrgs += 1;
        const message = (e as Error).message;
        report.push({
          organization: org.slug,
          failed: true,
          failureKind: classify(message),
          error: message,
        });
      }
    }

    // `ok` reflects what actually happened. Reporting ok:true over a failed
    // run is the specific dishonesty this rewrite exists to remove.
    const eventErrors = report.reduce((n, r) => {
      const evs = (r.events ?? {}) as Record<string, { error?: string }>;
      return n + Object.values(evs).filter((e) => e && e.error).length;
    }, 0);

    return json(200, {
      ok: failedOrgs === 0 && eventErrors === 0,
      dryRun,
      organizations: report.length,
      organizationsFailed: failedOrgs,
      eventErrors,
      results: report,
    });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
});

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function runForOrg(
  supabase: Db,
  org: Org,
  opts: { dryRun: boolean; forcedDate: string | null; forcedEvents: string[] | null },
): Promise<Record<string, unknown>> {
  const tz = tzOf(org);
  const today = opts.forcedDate ?? localDate(tz);
  const nowHHMM = localHHMM(tz);
  const notes: string[] = [];

  // Settings for THIS organization only. The old Map keyed purely on
  // event_key is what let one tenant's switch govern another's.
  const { data: settingRows, error: sErr } = await supabase
    .from("comms_automation_settings")
    .select("event_key, enabled, channel, timing, template_key, quiet_start, quiet_end")
    .eq("organization_id", org.id)
    .eq("enabled", true)
    .eq("timing", "scheduled");

  if (sErr) {
    return { organization: org.slug, date: today, error: sErr.message, events: {} };
  }

  const settings = new Map<string, Setting>(
    ((settingRows ?? []) as Setting[]).map((s) => [s.event_key, s]),
  );

  // Dry-run only: resolve these whether or not the tenant enabled them.
  for (const key of opts.forcedEvents ?? []) {
    if (!settings.has(key)) {
      settings.set(key, {
        event_key: key, enabled: true, channel: "whatsapp", timing: "scheduled",
        template_key: null, quiet_start: null, quiet_end: null,
      });
    }
  }

  if (settings.size === 0) {
    return { organization: org.slug, date: today, timezone: tz, events: {}, notes: ["no scheduled events enabled"] };
  }

  // Organization variables, resolved ONCE per tenant. Every message this pass
  // renders signs off with this organization's name — the defect that made
  // ABC's parents read "Thank you, ARK Learning Arena".
  const orgVars = await loadOrgVars(supabase, org);

  // Per-organization template overrides (Part 17: platform default + tenant
  // override). A row here wins; the canonical export is the fallback. An
  // override belonging to another tenant is unreachable — the query is scoped.
  const { data: tplRows } = await supabase
    .from("comms_templates")
    .select("template_key, body, is_active")
    .eq("organization_id", org.id)
    .eq("is_active", true);

  const overrides = new Map<string, string>(
    ((tplRows ?? []) as Array<{ template_key: string; body: string }>).map((t) => [t.template_key, t.body]),
  );

  const events: Record<string, unknown> = {};

  for (const [eventKey, setting] of settings) {
    const templateKey = setting.template_key ?? CANONICAL.eventTemplateKeys[eventKey];
    const bodyTemplate = overrides.get(templateKey) ?? CANONICAL.templates[templateKey]?.body;

    if (!bodyTemplate) {
      events[eventKey] = {
        skipped: true,
        failureKind: "TEMPLATE_ERROR" as FailureKind,
        templateStatus: "MISSING",
        reason: `no template '${templateKey}'`,
      };
      continue;
    }

    // Quiet hours never DROP a scheduled message — it is deferred to the end
    // of the window, matching the immediate path in commsDispatcher.
    let scheduledAt: string | null = null;
    if (inQuietHours(nowHHMM, setting.quiet_start, setting.quiet_end) && setting.quiet_end) {
      scheduledAt = `${today}T${setting.quiet_end.slice(0, 5)}:00`;
    }

    const stats = newStats();
    let drafts: Draft[];
    try {
      drafts = await resolveEvent(supabase, org, eventKey, today, orgVars, stats);
    } catch (e) {
      const message = (e as Error).message;
      events[eventKey] = {
        skipped: true,
        failureKind: classify(message),
        error: message,
        reason: message,
        templateStatus: "READY",
      };
      continue;
    }

    const outcome = await enqueueDrafts(supabase, org, {
      eventKey, templateKey, bodyTemplate, drafts, scheduledAt,
      dryRun: opts.dryRun, today, stats, orgVars,
    });
    events[eventKey] = outcome;
  }

  return { organization: org.slug, date: today, timezone: tz, events, notes };
}

/** The organization variable bag — the Deno twin of orgContext.service.ts. */
async function loadOrgVars(supabase: Db, org: Org): Promise<Record<string, string>> {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const { data: brand } = await supabase
    .from("organization_branding")
    .select("app_name, portal_name, support_email, support_phone, support_address, website_url, logo_url, primary_color, secondary_color, accent_color")
    .eq("organization_id", org.id)
    .maybeSingle();
  const { data: full } = await supabase
    .from("organizations")
    .select("contact_phone, contact_email, website, city, state, pincode")
    .eq("id", org.id)
    .maybeSingle();

  const b = (brand ?? {}) as Record<string, unknown>;
  const f = (full ?? {}) as Record<string, unknown>;
  const name = s(org.display_name) || s(b.app_name) || s(org.legal_name) || s(org.slug);
  const supportPhone = s(b.support_phone) || s(f.contact_phone);
  const supportEmail = s(b.support_email) || s(f.contact_email);

  return {
    org_name: name,
    org_short_name: s(b.portal_name) || s(org.slug) || name,
    org_legal_name: s(org.legal_name) || name,
    org_phone: s(f.contact_phone) || supportPhone,
    org_email: s(f.contact_email) || supportEmail,
    org_website: s(b.website_url) || s(f.website),
    org_address: s(b.support_address),
    org_city: s(f.city),
    org_state: s(f.state),
    org_pincode: s(f.pincode),
    org_logo: s(b.logo_url),
    org_support_phone: supportPhone,
    org_support_email: supportEmail,
    org_brand_primary: s(b.primary_color),
    org_brand_secondary: s(b.secondary_color),
    org_brand_accent: s(b.accent_color),
    // Legacy alias: several canonical bodies still say {{branch_name}}.
    branch_name: name,
  };
}

/**
 * Communication preference. NONE means NONE — it is checked here rather than
 * assumed, because the preference column existed for months with no send path
 * consulting it.
 */
function prefAllowsWhatsapp(pref: unknown): boolean {
  const p = String(pref ?? "").toLowerCase();
  if (p === "none") return false;
  if (p === "email") return false;
  return true; // whatsapp, both, unset/legacy → allowed
}

/** Resolve one scheduled event's audience + per-recipient variables. */
async function resolveEvent(
  supabase: Db,
  org: Org,
  eventKey: string,
  today: string,
  orgVars: Record<string, string>,
  stats: SkipStats,
): Promise<Draft[]> {
  const base = () => ({ ...orgVars });

  switch (eventKey) {
    // ── Birthdays today ───────────────────────────────────────────────────
    case "birthday_student": {
      const data = rows(await supabase
        .from("students")
        .select("id, name, parent_contact, parent_name, date_of_birth, communication_preference")
        .eq("organization_id", org.id)
        .not("date_of_birth", "is", null)
        .limit(5000), "students");
      const md = today.slice(5);
      const due = (data as Array<Record<string, string | null>>)
        .filter((r) => (r.date_of_birth ?? "").slice(5, 10) === md);
      stats.candidates += due.length;
      return due
        .filter((r) => {
          if (!r.parent_contact) { stats.missingPhone += 1; return false; }
          if (!prefAllowsWhatsapp(r.communication_preference)) { stats.preferenceSkipped += 1; return false; }
          return true;
        })
        .map((r) => ({
          eventKey, contextId: idempotencyKey(String(r.id), today), studentId: String(r.id),
          name: String(r.name ?? ""), phone: String(r.parent_contact),
          vars: { ...base(), student_name: String(r.name ?? ""), parent_name: String(r.parent_name ?? r.name ?? "") },
        }));
    }

    // ── Demos scheduled for tomorrow ──────────────────────────────────────
    //
    // The old code read `admission_calls.demo_date` / `.demo_time`. NEITHER
    // COLUMN EXISTS — admission_calls has `date`, `follow_up_date` and
    // `status`. PostgREST answers an unknown column with 42703, the error was
    // discarded, and demo reminders resolved to nothing regardless of the
    // insert failure. The real source is `demo_classes.scheduled_at`, joined
    // to `leads` for the prospect's phone.
    case "demo_reminder": {
      const tomorrow = addDays(today, 1);
      // `leads` has student_name / parent_name / phone — there is no `name`
      // column, and naming one 42703s the whole embed rather than the field.
      //
      // The window is deliberately WIDER than the target day and then narrowed
      // in TypeScript by the tenant's local date. scheduled_at is timestamptz;
      // asking for `>= tomorrowT00:00:00Z` would, in Asia/Kolkata, select
      // 05:30 tomorrow through 05:30 the day after — reminding some parents a
      // day early and missing the early-morning demos entirely.
      const data = rows(await supabase
        .from("demo_classes")
        .select("id, scheduled_at, subject, batch, status, lead_id, leads!inner(id, student_name, parent_name, phone, organization_id)")
        .eq("organization_id", org.id)
        .gte("scheduled_at", `${today}T00:00:00Z`)
        .lt("scheduled_at", `${addDays(tomorrow, 2)}T00:00:00Z`)
        .is("deleted_at", null)
        .limit(2000), "demo_classes");
      const live = (data as Array<Record<string, unknown>>).filter(
        (r) =>
          String(r.status ?? "") !== "cancelled" &&
          localDate(tzOf(org), new Date(String(r.scheduled_at))) === tomorrow,
      );
      stats.candidates += live.length;
      return live
        .map((r) => {
          const lead = (r.leads ?? {}) as Record<string, unknown>;
          const when = new Date(String(r.scheduled_at));
          const student = String(lead.student_name ?? "");
          return {
            eventKey, contextId: idempotencyKey(String(r.id), today),
            // The message goes to the parent's phone, so it greets the parent
            // where one is recorded and falls back to the student's name.
            name: String(lead.parent_name || student),
            phone: String(lead.phone ?? ""),
            vars: {
              ...base(),
              name: String(lead.parent_name || student),
              parent_name: String(lead.parent_name || student),
              student_name: student,
              // Rendered in the tenant's timezone, not UTC: a 6pm IST demo
              // must not be announced as 12:30.
              demo_date: localDate(tzOf(org), when),
              demo_time: localHHMM(tzOf(org), when),
              subject: String(r.subject ?? ""),
              // lead_demo_reminder_v2 asks for course_name; the demo row calls
              // the same thing `subject`, falling back to the batch.
              course_name: String(r.subject || r.batch || ""),
            },
          };
        })
        .filter((d) => {
          if (!d.phone) { stats.missingPhone += 1; return false; }
          return true;
        });
    }

    // ── Fees still pending ────────────────────────────────────────────────
    // `amount_pending` is a stored column — it is NOT derived here from
    // total minus paid, because the fee module maintains it alongside
    // discounts and seat-confirmation amounts, and recomputing it in a second
    // place is how a parent gets told they owe a number no invoice agrees with.
    case "fee_due": {
      const data = rows(await supabase
        .from("student_fees")
        .select(
          // student_fees has TWO foreign keys to students — student_id, and the
          // composite (organization_id, student_id) same-org guard — so an
          // unqualified embed is ambiguous and PostgREST refuses it. Naming the
          // constraint is the disambiguation.
          "id, student_id, amount_pending, due_date, batch_name, " +
            "students!student_fees_student_id_fkey!inner(id, name, parent_contact, parent_name, communication_preference)",
        )
        .eq("organization_id", org.id)
        .gt("amount_pending", 0)
        .limit(5000), "student_fees");
      const out: Draft[] = [];
      stats.candidates += (data as unknown[]).length;
      for (const row of data as Array<Record<string, unknown>>) {
        const st = (row.students ?? {}) as Record<string, unknown>;
        if (!st.parent_contact) { stats.missingPhone += 1; continue; }
        if (!prefAllowsWhatsapp(st.communication_preference)) { stats.preferenceSkipped += 1; continue; }
        out.push({
          eventKey, contextId: idempotencyKey(String(st.id), today), studentId: String(st.id),
          name: String(st.name ?? ""), phone: String(st.parent_contact),
          vars: {
            ...base(),
            student_name: String(st.name ?? ""),
            parent_name: String(st.parent_name ?? st.name ?? ""),
            batch_name: String(row.batch_name ?? ""),
            amount_pending: String(row.amount_pending ?? ""),
            amount_due: String(row.amount_pending ?? ""),
            due_date: String(row.due_date ?? ""),
            pay_url: orgVars.org_website,
          },
        });
      }
      return out;
    }

    // ── Exams happening tomorrow ──────────────────────────────────────────
    case "exam_scheduled": {
      const tomorrow = addDays(today, 1);
      // `title`, not `name` — exams has no `name` column.
      const exams = rows(await supabase
        .from("exams")
        .select("id, title, exam_date, start_time, hall, subject_name, standard_id, status")
        .eq("organization_id", org.id)
        .eq("exam_date", tomorrow)
        .limit(200), "exams");
      const list = exams as Array<Record<string, unknown>>;
      if (list.length === 0) return [];
      const students = rows(await supabase
        .from("students")
        .select("id, name, parent_contact, parent_name, standard_id, communication_preference")
        .eq("organization_id", org.id)
        .limit(5000), "students");
      const out: Draft[] = [];
      for (const ex of list) {
        if (String(ex.status ?? "") === "cancelled") continue;
        for (const st of students as Array<Record<string, unknown>>) {
          if (ex.standard_id && st.standard_id !== ex.standard_id) continue;
          stats.candidates += 1;
          if (!st.parent_contact) { stats.missingPhone += 1; continue; }
          if (!prefAllowsWhatsapp(st.communication_preference)) { stats.preferenceSkipped += 1; continue; }
          out.push({
            eventKey, contextId: idempotencyKey(`${ex.id}:${st.id}`, today), studentId: String(st.id),
            name: String(st.name ?? ""), phone: String(st.parent_contact),
            vars: {
              ...base(),
              student_name: String(st.name ?? ""),
              parent_name: String(st.parent_name ?? st.name ?? ""),
              exam_name: String(ex.title ?? ""),
              exam_date: String(ex.exam_date ?? ""),
              exam_time: String(ex.start_time ?? ""),
              subject_name: String(ex.subject_name ?? ""),
              venue: String(ex.hall ?? ""),
            },
          });
        }
      }
      return out;
    }

    // ── Tasks due tomorrow ────────────────────────────────────────────────
    case "task_due": {
      const tomorrow = addDays(today, 1);
      const data = rows(await supabase
        .from("tasks")
        .select("id, title, due_date, assigned_to, status")
        .eq("organization_id", org.id)
        .eq("due_date", tomorrow)
        .limit(2000), "tasks");
      const due = (data as Array<Record<string, unknown>>)
        .filter((t) => String(t.status ?? "") !== "completed" && !!t.assigned_to);
      if (due.length === 0) return [];
      const ids = [...new Set(due.map((t) => String(t.assigned_to)))];
      const staff = rows(
        await supabase.from("profiles").select("id, name, mobile").in("id", ids), "profiles");
      const byId = new Map(
        (staff as Array<Record<string, unknown>>).map((p) => [String(p.id), p]),
      );
      const out: Draft[] = [];
      stats.candidates += due.length;
      for (const t of due) {
        const p = byId.get(String(t.assigned_to));
        if (!p?.mobile) { stats.missingPhone += 1; continue; }
        out.push({
          eventKey, contextId: idempotencyKey(String(t.id), today),
          name: String(p.name ?? ""), phone: String(p.mobile),
          vars: {
            ...base(),
            recipient_name: String(p.name ?? ""),
            staff_name: String(p.name ?? ""),
            // `task_name` and `status` are what task_reminder's body actually
            // asks for; supplying task_title would have left both unresolved
            // and skipped every message.
            task_name: String(t.title ?? ""),
            task_title: String(t.title ?? ""),
            status: String(t.status ?? ""),
            due_date: String(t.due_date ?? ""),
          },
        });
      }
      return out;
    }

    // ── Holiday notice — BLOCKED, deliberately not implemented ────────────
    //
    // There is NO holidays table in this database (checked 2026-08-12: the
    // only `%holiday%` match is nothing; `demo_classes` and
    // `platform_demo_requests` are the only near matches for the demo case).
    // The event is registered and can be switched on in the Automation
    // Center, but there is no source of truth for WHICH day is a holiday.
    //
    // Inventing one — hardcoding a festival list, or treating a day with zero
    // classes as a holiday — would send confident, wrong messages to every
    // parent in the school. It stays BLOCKED until a holidays table exists,
    // and reports itself as such rather than resolving to a silent zero.
    case "holiday_notice":
      throw new Error("BLOCKED: no holidays table exists — nothing defines which date is a holiday");

    default:
      return [];
  }
}

/** Count structured skip codes: { MISSING_DUE_DATE: 126 }. */
function tally(skipped: Array<{ code: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skipped) out[s.code] = (out[s.code] ?? 0) + 1;
  return out;
}

/**
 * Render, de-duplicate and insert. One bad recipient never stops the batch —
 * it is counted and reported, which is the difference between a school
 * noticing seven parents were missed and a school noticing nothing.
 */
async function enqueueDrafts(
  supabase: Db,
  org: Org,
  args: {
    eventKey: string; templateKey: string; bodyTemplate: string;
    drafts: Draft[]; scheduledAt: string | null; dryRun: boolean; today: string;
    stats: SkipStats; orgVars: Record<string, string>;
  },
): Promise<Record<string, unknown>> {
  const { eventKey, templateKey, bodyTemplate, drafts, scheduledAt, dryRun, today, stats, orgVars } = args;

  // The same shape whether or not anybody qualified, so a caller never has to
  // distinguish "no key present" from "zero".
  const breakdown = () => ({
    candidates: stats.candidates,
    eligible: drafts.length,
    preferenceSkipped: stats.preferenceSkipped,
    missingPhone: stats.missingPhone,
    templateKey,
    templateStatus: "READY",
    quietHoursDeferred: scheduledAt ? drafts.length : 0,
    scheduledAt,
  });

  if (drafts.length === 0) {
    return { ...breakdown(), queued: 0, duplicates: 0, missingVariableSkipped: 0 };
  }

  // Already queued today for this (organization, event)? Scoped by
  // organization_id so one tenant's send can never suppress another's.
  // A FAILED dedupe lookup must not read as "nothing sent yet" — that would
  // re-message every parent on the next run. Fail the event instead.
  const { data: existingRows, error: dupErr } = await supabase
    .from("message_queue")
    .select("context_id")
    .eq("organization_id", org.id)
    .eq("context_type", eventKey)
    .gte("created_at", `${today}T00:00:00Z`)
    .limit(10000);
  if (dupErr) {
    return { resolved: drafts.length, queued: 0, error: `duplicate check failed: ${dupErr.message}` };
  }
  const seen = new Set(
    ((existingRows ?? []) as Array<{ context_id: string | null }>)
      .map((r) => r.context_id).filter(Boolean) as string[],
  );

  const queueRows: Record<string, unknown>[] = [];
  const skipped: Array<{ contextId: string; code: string; missing: string[] }> = [];
  let duplicates = 0;

  for (const d of drafts) {
    if (seen.has(d.contextId)) { duplicates += 1; continue; }
    seen.add(d.contextId); // guards duplicates WITHIN this batch too

    const { text, missing } = render(bodyTemplate, d.vars);
    if (missing.length > 0) {
      // Truthful refusal. Sending "Exam on  - " is worse than sending nothing,
      // and silently substituting a plausible value would be inventing data.
      //
      // The reason is STRUCTURED, not a sentence: the Communication Center
      // groups by it, and "MISSING_DUE_DATE × 126" is a fixable work item
      // whereas 126 lines of prose is noise. ARK's 126 pending fee rows all
      // have due_date NULL, which is what makes this the common case rather
      // than an edge one.
      skipped.push({
        contextId: d.contextId,
        code: missing.map((v) => `MISSING_${v.toUpperCase()}`).join("+"),
        missing,
      });
      continue;
    }

    queueRows.push({
      organization_id: org.id, // explicit — current_org_id() is NULL here
      channel: "whatsapp",
      provider: "aisensy",
      template: templateKey,
      template_key: templateKey,
      recipient_name: d.name,
      recipient_phone: d.phone,
      recipient_student_id: d.studentId ?? null,
      recipient_kind: d.studentId ? "student" : "staff",
      payload: { ...d.vars, __body: text },
      context_type: eventKey,
      context_id: d.contextId,
      status: "queued",
      scheduled_at: scheduledAt,
    });
  }

  if (dryRun) {
    return {
      ...breakdown(),
      dryRun: true,
      wouldQueue: queueRows.length,
      duplicates,
      missingVariableSkipped: skipped.length,
      missingDataReasons: tally(skipped),
      missingVariableExamples: skipped.slice(0, 3),
      sampleMessage: queueRows[0]
        ? String((queueRows[0].payload as Record<string, unknown>).__body)
        : null,
      // The tenant identity that would appear in the message. Printed so a
      // reviewer can see WHOSE name is on it without reading the whole body.
      tenantVariables: {
        org_name: orgVars.org_name,
        org_short_name: orgVars.org_short_name,
        org_phone: orgVars.org_phone,
        org_website: orgVars.org_website,
      },
    };
  }

  let queued = 0;
  let error: string | null = null;
  if (queueRows.length > 0) {
    // `.select("id")` so the count is the number of rows the DATABASE
    // acknowledges, not the number we hoped to write. Reporting
    // queueRows.length on a partial write would be the same class of lie the
    // old `return 0 but ok:true` was.
    const res = await supabase.from("message_queue").insert(queueRows).select("id");
    if (res.error) {
      error = res.error.message;
    } else {
      queued = (res.data as unknown[] | null)?.length ?? 0;
      if (queued !== queueRows.length) {
        error = `insert acknowledged ${queued} of ${queueRows.length} rows`;
      }
    }
  }

  return {
    ...breakdown(),
    queued,
    duplicates,
    missingVariableSkipped: skipped.length,
    missingDataReasons: tally(skipped),
    // A failed INSERT is reported as a failure. The old code returned 0 and
    // let the caller read it as "nothing was due".
    ...(error ? { error, failureKind: classify(error) } : {}),
  };
}
