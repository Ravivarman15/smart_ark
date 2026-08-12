// ──────────────────────────────────────────────────────────────────────────────
// COMMUNICATION AUTOMATION GATES
//
// Each block below exists because the corresponding failure was found in
// production on 2026-08-12, not because it seemed like a good idea.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AUTOMATION_EVENTS } from "@/features/communication/constants/automationEvents";
import { BUILTIN_TEMPLATES_BY_KEY } from "@/features/communication/utils/whatsappTemplates";
import { LEAD_TEMPLATES } from "@/features/leads/utils/leadWhatsappTemplates";
import { ORG_VARIABLE_KEYS } from "@/features/communication/services/orgContext.service";
import { PROVIDER_TEMPLATES } from "@/features/communication/constants/providerTemplates";
import { exportTemplates } from "../commsTemplateExport.gen.test";

const ROOT = join(__dirname, "..", "..", "..");
const MIRROR = join(ROOT, "supabase", "functions", "_shared", "commsTemplates.json");
const SCHEDULER = join(ROOT, "supabase", "functions", "comms-scheduler", "index.ts");

const templateFor = (key: string) =>
  BUILTIN_TEMPLATES_BY_KEY[key] ??
  (LEAD_TEMPLATES as Record<string, { body: string; variables: string[] }>)[key];

// ── 1 ────────────────────────────────────────────────────────────────────────
describe("every automation event has a template", () => {
  // ARK had TEN Academics automations switched ON in comms_automation_settings,
  // wired to real dispatch() call sites, whose defaultTemplate existed in
  // neither comms_templates nor whatsappTemplates.ts. templateFor() returned
  // null and every dispatch ended at empty(eventKey, "no template") — ten green
  // switches that could not send a message.
  it.each(AUTOMATION_EVENTS.map((e) => [e.key, e.defaultTemplate]))(
    "%s → %s",
    (eventKey, templateKey) => {
      expect(
        templateFor(templateKey),
        `Event "${eventKey}" points at template "${templateKey}", which is defined nowhere. ` +
          `The Automation Center would show it as available and it would silently send nothing.`,
      ).toBeDefined();
    },
  );
});

// ── 2 ────────────────────────────────────────────────────────────────────────
describe("no template carries a tenant's identity", () => {
  // The whole point of the multi-tenant work: ABC Academi's parents must never
  // read ARK's name on WhatsApp.
  const BANNED = [
    /ark\s+learning\s+arena/i,
    /thearktuition/i,
    /arktuition\.com/i,
    /\bark\s+crm\b/i,
    /the\s+ark\s+tuition/i,
  ];

  const all = [
    ...Object.values(BUILTIN_TEMPLATES_BY_KEY).map((t) => [t.key, t.body] as const),
    ...Object.values(LEAD_TEMPLATES).map((t) => [t.key, t.body] as const),
    ...PROVIDER_TEMPLATES.map((t) => [`provider:${t.key}`, t.body] as const),
  ];

  it.each(all)("%s", (key, body) => {
    for (const re of BANNED) {
      expect(
        re.test(body),
        `Template "${key}" hardcodes a tenant identity matching ${re}. Use {{org_name}}.`,
      ).toBe(false);
    }
  });
});

// ── 3 ────────────────────────────────────────────────────────────────────────
describe("organization variables are a closed set", () => {
  it("declares all fifteen required by the communication contract", () => {
    for (const k of [
      "org_name", "org_short_name", "org_phone", "org_email", "org_address",
      "org_city", "org_state", "org_pincode", "org_website", "org_logo",
      "org_support_phone", "org_support_email",
      "org_brand_primary", "org_brand_secondary", "org_brand_accent",
    ]) {
      expect(ORG_VARIABLE_KEYS, `${k} is missing from the org variable bag`).toContain(k);
    }
  });

  it("no template references an org_* variable the resolver cannot supply", () => {
    // A body saying {{org_district}} renders a literal "{{org_district}}" to a
    // parent, or an empty gap — both are visible to a customer.
    const offenders: string[] = [];
    for (const t of [...Object.values(BUILTIN_TEMPLATES_BY_KEY), ...Object.values(LEAD_TEMPLATES)]) {
      for (const m of t.body.matchAll(/\{\{\s*(org_[a-z0-9_]+)\s*\}\}/g)) {
        if (!(ORG_VARIABLE_KEYS as readonly string[]).includes(m[1])) {
          offenders.push(`${t.key}: {{${m[1]}}}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── 3b ───────────────────────────────────────────────────────────────────────
describe("declared variables match the body", () => {
  // `variables` is what a caller reads to know what to supply. Where it
  // disagrees with the body, a caller supplies everything it was told to and
  // the message still renders a gap — which is how "Class 7 - " reaches a
  // parent. Found live: attendance_absent declared four variables while its
  // body used five ({{section}} was undeclared).
  const all = [
    ...Object.values(BUILTIN_TEMPLATES_BY_KEY).map((t) => [t.key, t.body, t.variables] as const),
    ...Object.values(LEAD_TEMPLATES).map((t) => [t.key, t.body, t.variables] as const),
  ];

  it.each(all)("%s", (key, body, declared) => {
    const used = new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]));
    // org_* comes from the organization bag that every dispatch merges in, not
    // from the caller, so it is correctly absent from a template's own list.
    // Section 3 already proves every org_* used is one the resolver supplies.
    const undeclared = [...used].filter((v) => !v.startsWith("org_") && !declared.includes(v));
    expect(
      undeclared,
      `Template "${key}" uses ${undeclared.map((v) => `{{${v}}}`).join(", ")} but does not declare them.`,
    ).toEqual([]);
  });
});

// ── 4 ────────────────────────────────────────────────────────────────────────
describe("Deno template mirror does not drift", () => {
  // The scheduler runs in Deno and cannot import the TypeScript source, so the
  // bodies are exported to JSON. If the two ever disagree, the message a
  // scheduled automation sends stops matching the one the app previews.
  it("matches the canonical TypeScript source exactly", () => {
    expect(existsSync(MIRROR), `${MIRROR} is missing. Run: node scripts/sync-comms-templates.mjs`).toBe(true);
    const onDisk = JSON.parse(readFileSync(MIRROR, "utf8"));
    expect(
      onDisk,
      "The Deno mirror is stale. Run: node scripts/sync-comms-templates.mjs",
    ).toEqual(exportTemplates());
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────
describe("the scheduler is tenant-safe", () => {
  const src = readFileSync(SCHEDULER, "utf8");

  // Each assertion below maps to a distinct fault the previous version had.
  it("writes organization_id explicitly on every queue row", () => {
    // message_queue.organization_id is NOT NULL DEFAULT current_org_id(), and
    // the scheduler runs as service_role with no JWT. Once a second
    // organization existed the default resolved to NULL and every insert
    // failed the not-null constraint — silently, because the error was dropped.
    expect(src).toMatch(/organization_id:\s*org\.id/);
  });

  it("renders __body — send-aisensy permanently fails rows without it", () => {
    expect(src).toMatch(/__body/);
  });

  it("scopes settings to one organization instead of a global Map", () => {
    expect(src).toMatch(/from\("comms_automation_settings"\)[\s\S]{0,400}?\.eq\("organization_id"/);
  });

  it("uses the tenant timezone, not the server clock", () => {
    expect(src).toMatch(/timeZone:\s*tz/);
    // A bare toISOString() day boundary is the UTC bug this replaced.
    expect(src).not.toMatch(/const\s+todayStr\s*=\s*iso\(today\)/);
  });

  it("consults quiet hours and communication preference", () => {
    expect(src).toMatch(/inQuietHours\(/);
    expect(src).toMatch(/prefAllowsWhatsapp\(/);
  });

  it("supports a dry run that writes nothing", () => {
    expect(src).toMatch(/if\s*\(dryRun\)/);
  });

  it("scopes the duplicate check per organization", () => {
    expect(src).toMatch(/from\("message_queue"\)[\s\S]{0,300}?\.eq\("organization_id",\s*org\.id\)/);
  });

  it("declares holiday_notice BLOCKED rather than inventing a holiday source", () => {
    expect(src).toMatch(/BLOCKED: no holidays table/);
  });
});

// ── 6 ────────────────────────────────────────────────────────────────────────
describe("provider template parameter mirror", () => {
  // send-aisensy posts positional templateParams; Meta renders its own body.
  // If our declared parameter list and the body's {{n}} placeholders disagree,
  // a date lands where a name belongs and nothing errors.
  it.each(PROVIDER_TEMPLATES.map((t) => [t.campaign, t] as const))(
    "%s body placeholders match its declared params",
    (_campaign, t) => {
      const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      const unique = [...new Set(used)].sort((a, b) => a - b);

      expect(unique, `${t.campaign}: placeholders must run 1..n with no gaps`)
        .toEqual(Array.from({ length: t.params.length }, (_, i) => i + 1));

      // Meta rejects a template whose parameters are not in ascending order,
      // and rejects one that repeats a parameter. Both rules were broken by the
      // first credential submissions.
      expect(used, `${t.campaign}: each parameter must appear exactly once`).toHaveLength(unique.length);
      expect(used, `${t.campaign}: parameters must appear in ascending order`)
        .toEqual([...used].sort((a, b) => a - b));
    },
  );

  it("keeps org_name in the final position so the legacy order is append-only", () => {
    for (const t of PROVIDER_TEMPLATES) {
      expect(t.params[t.params.length - 1], `${t.campaign} must append org_name last`).toBe("org_name");
    }
  });
});
