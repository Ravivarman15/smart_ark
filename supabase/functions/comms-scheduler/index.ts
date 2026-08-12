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
// Deploy: supabase functions deploy comms-scheduler
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import TEMPLATES from "../_shared/commsTemplates.json" with { type: "json" };

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

/** One resolved message, before it becomes a queue row. */
interface Draft {
  eventKey: string;
  contextId: string;
  name: string;
  phone: string;
  studentId?: string;
  vars: Record<string, string>;
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
    const onlyOrg: string | null = body?.organizationId ?? null;
    const forcedDate: string | null = body?.date ?? null;

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

    for (const org of (orgRows ?? []) as Org[]) {
      report.push(await runForOrg(supabase, org, { dryRun, forcedDate, forcedEvents }));
    }

    return json(200, {
      ok: true,
      dryRun,
      organizations: report.length,
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
  const tz = org.timezone || "Asia/Kolkata";
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
      events[eventKey] = { skipped: true, reason: `no template '${templateKey}'` };
      continue;
    }

    // Quiet hours never DROP a scheduled message — it is deferred to the end
    // of the window, matching the immediate path in commsDispatcher.
    let scheduledAt: string | null = null;
    if (inQuietHours(nowHHMM, setting.quiet_start, setting.quiet_end) && setting.quiet_end) {
      scheduledAt = `${today}T${setting.quiet_end.slice(0, 5)}:00`;
    }

    let drafts: Draft[];
    try {
      drafts = await resolveEvent(supabase, org, eventKey, today, orgVars);
    } catch (e) {
      events[eventKey] = { skipped: true, reason: `resolver error: ${(e as Error).message}` };
      continue;
    }

    const outcome = await enqueueDrafts(supabase, org, {
      eventKey, templateKey, bodyTemplate, drafts, scheduledAt,
      dryRun: opts.dryRun, today,
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
      return (data as Array<Record<string, string | null>>)
        .filter((r) => (r.date_of_birth ?? "").slice(5, 10) === md)
        .filter((r) => !!r.parent_contact && prefAllowsWhatsapp(r.communication_preference))
        .map((r) => ({
          eventKey, contextId: String(r.id), studentId: String(r.id),
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
      const data = rows(await supabase
        .from("demo_classes")
        .select("id, scheduled_at, subject, batch, status, lead_id, leads!inner(id, name, phone, organization_id)")
        .eq("organization_id", org.id)
        .gte("scheduled_at", `${tomorrow}T00:00:00Z`)
        .lt("scheduled_at", `${addDays(tomorrow, 1)}T00:00:00Z`)
        .is("deleted_at", null)
        .limit(2000), "demo_classes");
      return (data as Array<Record<string, unknown>>)
        .filter((r) => String(r.status ?? "") !== "cancelled")
        .map((r) => {
          const lead = (r.leads ?? {}) as Record<string, unknown>;
          const at = String(r.scheduled_at ?? "");
          return {
            eventKey, contextId: String(r.id),
            name: String(lead.name ?? ""), phone: String(lead.phone ?? ""),
            vars: {
              ...base(),
              name: String(lead.name ?? ""),
              student_name: String(lead.name ?? ""),
              demo_date: at.slice(0, 10),
              demo_time: at.slice(11, 16),
              subject: String(r.subject ?? ""),
              // lead_demo_reminder_v2 asks for course_name; the demo row calls
              // the same thing `subject`, falling back to the batch.
              course_name: String(r.subject ?? r.batch ?? ""),
            },
          };
        })
        .filter((d) => !!d.phone);
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
      for (const row of data as Array<Record<string, unknown>>) {
        const st = (row.students ?? {}) as Record<string, unknown>;
        if (!st.parent_contact || !prefAllowsWhatsapp(st.communication_preference)) continue;
        out.push({
          eventKey, contextId: String(st.id), studentId: String(st.id),
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
          if (!st.parent_contact || !prefAllowsWhatsapp(st.communication_preference)) continue;
          out.push({
            eventKey, contextId: `${ex.id}:${st.id}`, studentId: String(st.id),
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
      for (const t of due) {
        const p = byId.get(String(t.assigned_to));
        if (!p?.mobile) continue;
        out.push({
          eventKey, contextId: String(t.id),
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
  },
): Promise<Record<string, unknown>> {
  const { eventKey, templateKey, bodyTemplate, drafts, scheduledAt, dryRun, today } = args;
  if (drafts.length === 0) {
    return { resolved: 0, queued: 0, duplicates: 0, skipped: 0 };
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
  const skipped: Array<{ contextId: string; reason: string }> = [];
  let duplicates = 0;

  for (const d of drafts) {
    if (seen.has(d.contextId)) { duplicates += 1; continue; }
    seen.add(d.contextId); // guards duplicates WITHIN this batch too

    const { text, missing } = render(bodyTemplate, d.vars);
    if (missing.length > 0) {
      // Truthful refusal. Sending "Exam on  - " is worse than sending nothing,
      // and silently substituting a plausible value would be inventing data.
      skipped.push({ contextId: d.contextId, reason: `unresolved: ${missing.join(", ")}` });
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
      dryRun: true,
      resolved: drafts.length,
      wouldQueue: queueRows.length,
      duplicates,
      skipped: skipped.length,
      skippedReasons: skipped.slice(0, 10),
      sample: queueRows[0] ? String((queueRows[0].payload as Record<string, unknown>).__body) : null,
    };
  }

  let queued = 0;
  let error: string | null = null;
  if (queueRows.length > 0) {
    const res = await supabase.from("message_queue").insert(queueRows);
    if (res.error) error = res.error.message;
    else queued = queueRows.length;
  }

  return {
    resolved: drafts.length,
    queued,
    duplicates,
    skipped: skipped.length,
    skippedReasons: skipped.slice(0, 10),
    ...(error ? { error } : {}),
  };
}
