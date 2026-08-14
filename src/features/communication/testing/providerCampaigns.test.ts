// ════════════════════════════════════════════════════════════════════════════
// PHASE F — DOES THE CAMPAIGN EXIST?
//
// providerTemplates.test.ts already gates the SHAPE of a template: parameter
// order, no repeats, no tenant name in the body, no accidental cutover. Every
// one of those gates was green on 2026-08-12, the day `staff_credentials`
// failed for the sixth time with:
//
//     HTTP 400: Campaign does not exist.
//
// Because none of them asked the one question that decides whether a message
// can be delivered at all: is there a campaign at the other end of the name we
// post? The lifecycle tracked the NEW template's journey through Meta review
// and simply assumed the legacy campaign it falls back to was real.
//
// These gates close that. They are deliberately about evidence rather than
// intent — a campaign is only VERIFIED if a real message went through it, and
// a MISSING one has to cite the refusal that proves it.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMPAIGN_LEDGER,
  campaignVerdict,
  deadCampaigns,
  brandedCampaigns,
} from "../constants/providerCampaigns";
import { PROVIDER_TEMPLATES, resolveCampaign } from "../constants/providerTemplates";
import { validateEnqueue } from "../utils/commsValidation";
import { diagnoseAutomation } from "../utils/automationState";
import { AUTOMATION_EVENTS_BY_KEY } from "../constants/automationEvents";
import { BUILTIN_TEMPLATES_BY_KEY } from "../utils/whatsappTemplates";
import { LEAD_TEMPLATES } from "@/features/leads/utils/leadWhatsappTemplates";
import {
  buildTemplateParams,
  POSITIONAL_TEMPLATES,
} from "@/features/leads/utils/templateParams";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** One value per variable any campaign names, so no parameter renders empty. */
const SAMPLE: Record<string, string> = {
  parent_name: "Mr. Kumar", student_name: "Arjun", staff_name: "Priya S",
  counselor_name: "Divya R", class: "9th Standard", class_name: "9th Standard",
  batch_name: "9th Standard", section: "A", attendance_date: "10 Aug 2026",
  date: "10 Aug 2026", role: "Teacher", login_email: "priya@example.com",
  username: "priya@example.com", password: "Tmp#4821",
  login_url: "https://example.com/login", receipt_no: "RCP-2026-0417",
  amount_paid: "12,400", pending_balance: "3,600", course_name: "NEET Repeater",
  course: "NEET Repeater", mobile_number: "+919876543210",
  demo_date: "12 Aug 2026", demo_time: "4:30 PM", faculty_name: "Mr. Iyer",
  org_name: "Example Institute", __body: "rendered body",
};

/**
 * Every campaign name `resolveCampaign()` can return — the exact set the
 * application is able to post to through the provider lifecycle.
 */
const SEND_PATH_CAMPAIGNS = [
  ...new Set(PROVIDER_TEMPLATES.flatMap((t) => [t.campaign, t.legacyCampaign])),
];

describe("every campaign the app can post to is declared", () => {
  it.each(SEND_PATH_CAMPAIGNS)("%s is in the ledger", (name) => {
    expect(
      CAMPAIGN_LEDGER[name],
      `"${name}" can be posted by resolveCampaign() but nothing records whether it ` +
        `exists at AiSensy. That is precisely how staff_credentials shipped: a ` +
        `fallback nobody had ever verified.`,
    ).toBeDefined();
  });

  it.each(Object.values(LEAD_TEMPLATES).map((t) => t.providerName))(
    "lead campaign %s is in the ledger",
    (name) => {
      expect(CAMPAIGN_LEDGER[name], `lead campaign "${name}" is undeclared`).toBeDefined();
    },
  );

  it("declares nothing it cannot justify", () => {
    // A ledger entry is a claim about the outside world. Every one carries the
    // observation behind it, so a future reader can tell a measured fact from
    // an assumption somebody typed.
    for (const r of Object.values(CAMPAIGN_LEDGER)) {
      expect(r.evidence, `${r.name} has no evidence recorded`).toBeTruthy();
      expect(r.evidence.length, `${r.name}'s evidence is too thin to act on`)
        .toBeGreaterThan(30);
    }
  });

  it("every VERIFIED or refused campaign cites a date", () => {
    // "Works" and "does not exist" are both claims about a moment in time.
    // Without a date nobody can tell whether the evidence predates the change
    // that broke it.
    for (const r of Object.values(CAMPAIGN_LEDGER)) {
      if (r.existence === "UNVERIFIED") continue;
      expect(r.evidence, `${r.name} (${r.existence}) cites no date`)
        .toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("parameter arity is recorded, not assumed", () => {
  // ┌── THE FAILURE THIS GATE REPRODUCES ────────────────────────────────────┐
  // │ `attendance_present` failed live with "Template params does not match  │
  // │ the campaign". It has no spec in either templateParams mirror, so      │
  // │ buildTemplateParams fell through to its single-body fallback and       │
  // │ posted ONE parameter into a multi-parameter template.                  │
  // │                                                                        │
  // │ That fallback is load-bearing for genuinely single-parameter           │
  // │ broadcasts, so it cannot be removed — but silently degrading a         │
  // │ six-parameter credential template to one parameter is a 400 every      │
  // │ time, and nothing in the build noticed.                                │
  // └────────────────────────────────────────────────────────────────────────┘

  it.each(SEND_PATH_CAMPAIGNS)("%s has a positional spec", (name) => {
    const declared = CAMPAIGN_LEDGER[name]?.params ?? 0;
    if (declared <= 1) return; // the single-body fallback is correct here
    expect(
      POSITIONAL_TEMPLATES,
      `"${name}" declares ${declared} parameters but has no spec, so every send ` +
        `posts the whole body as a single {{1}} and Meta rejects it`,
    ).toContain(name);
  });

  it.each(SEND_PATH_CAMPAIGNS)("%s emits exactly the parameters it declares", (name) => {
    const declared = CAMPAIGN_LEDGER[name]?.params ?? 0;
    if (declared <= 1) return;
    expect(
      buildTemplateParams(name, SAMPLE).length,
      `"${name}" is recorded at ${declared} parameters but the builder emits a ` +
        `different count — one of the two is wrong, and the provider will say which`,
    ).toBe(declared);
  });

  it("a provider template's declared params match its ledger entry", () => {
    for (const t of PROVIDER_TEMPLATES) {
      expect(
        CAMPAIGN_LEDGER[t.campaign]?.params,
        `${t.campaign}: registry says ${t.params.length} params, ledger disagrees`,
      ).toBe(t.params.length);
      // The legacy predecessor takes exactly one fewer — the org_name that was
      // appended. This is what makes the fallback safe to keep using.
      expect(
        CAMPAIGN_LEDGER[t.legacyCampaign]?.params,
        `${t.legacyCampaign}: legacy arity must be one below ${t.campaign}`,
      ).toBe(t.params.length - 1);
    }
  });
});

describe("both templateParams mirrors carry every spec", () => {
  // send-aisensy cannot import from src/, so the spec table is duplicated by
  // hand. providerTemplates.test.ts checks this for the multi-tenant family;
  // the LEAD campaigns — the ones actually carrying traffic today — were never
  // covered.
  const appSpecs = read("src/features/leads/utils/templateParams.ts");
  const denoSpecs = read("supabase/functions/send-aisensy/index.ts");

  it.each(POSITIONAL_TEMPLATES)("%s exists in the send-aisensy mirror", (name) => {
    const objectForm = new RegExp(`\\b${name}:\\s*\\(p\\)`);
    const assignForm = new RegExp(`TEMPLATE_PARAM_SPECS\\["${name}"\\]`);
    expect(
      objectForm.test(denoSpecs) || assignForm.test(denoSpecs),
      `"${name}" has an app-side spec but none in send-aisensy. The drainer would ` +
        `post one parameter where the app rendered several.`,
    ).toBe(true);
  });

  it("the app table is the one that defines the set", () => {
    // Guards the gate above from going vacuous if POSITIONAL_TEMPLATES ever
    // stops reflecting the file it is derived from.
    expect(POSITIONAL_TEMPLATES.length).toBeGreaterThan(20);
    for (const name of POSITIONAL_TEMPLATES.slice(0, 5)) {
      expect(appSpecs).toContain(name);
    }
  });
});

describe("a refused campaign is refused everywhere", () => {
  it("MISSING and REJECTED are not sendable; UNVERIFIED is", () => {
    expect(campaignVerdict("staff_credentials").sendable).toBe(false);
    expect(campaignVerdict("smartark_staff_credentials1").sendable).toBe(false);
    // UNVERIFIED MUST stay sendable, or no new campaign could ever earn its
    // first piece of evidence and the ledger would freeze the platform.
    expect(campaignVerdict("parent_credentials").sendable).toBe(true);
    expect(campaignVerdict("smartark_lead_enquiry_received").sendable).toBe(true);
    // An unregistered name is sendable too: this ledger governs what we KNOW,
    // and a gap in it must never silence a working flow.
    expect(campaignVerdict("something_nobody_declared").sendable).toBe(true);
  });

  it("resolveCampaign reports the legacy fallback as unsendable", () => {
    const r = resolveCampaign("staff_credentials");
    expect(r?.campaign).toBe("staff_credentials");
    // The old contract — and the whole bug — was that this looked fine.
    expect(r?.status).toBe("REJECTED");
    expect(r?.sendable).toBe(false);
    expect(r?.blockedReason).toMatch(/does not exist/i);
  });

  it("resolveCampaign reports a working campaign as sendable", () => {
    const r = resolveCampaign("attendance_absent");
    expect(r?.campaign).toBe("smartark_attendance_absent");
    expect(r?.sendable).toBe(true);
    expect(r?.blockedReason).toBeUndefined();
  });

  it("validateEnqueue refuses to queue a dead campaign", () => {
    const res = validateEnqueue({
      channel: "whatsapp",
      rendered: { body: "Dear Priya, your account is ready.", missing: [] },
      recipient: { kind: "staff", name: "Priya", phone: "+919876543210" },
      campaign: "staff_credentials",
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("dead_campaign");
    expect(res.reason).toMatch(/does not exist/i);
  });

  it("validateEnqueue still queues an unverified campaign", () => {
    const res = validateEnqueue({
      channel: "whatsapp",
      rendered: { body: "Dear Mr. Kumar, the portal account is ready.", missing: [] },
      recipient: { kind: "parent", name: "Mr. Kumar", phone: "+919876543210" },
      campaign: "parent_credentials",
    });
    expect(res.ok).toBe(true);
  });

  it("an email-only message is unaffected by a dead WhatsApp campaign", () => {
    const res = validateEnqueue({
      channel: "email",
      rendered: { body: "Your account is ready.", missing: [] },
      recipient: { kind: "staff", name: "Priya" },
      campaign: "staff_credentials",
    });
    expect(res.ok).toBe(true);
  });
});

describe("the Automation Center tells the truth about it", () => {
  it("staff credentials no longer read as merely provider-pending", () => {
    // The exact regression: this event showed PROVIDER_PENDING with the reason
    // "Sends today via the legacy provider campaign" — a reassuring sentence
    // about a campaign that does not exist.
    const d = diagnoseAutomation(AUTOMATION_EVENTS_BY_KEY["staff_credentials"], {
      setting: { enabled: true },
    });
    expect(d.state).toBe("PROVIDER_MISSING");
    expect(d.dispatchable).toBe(false);
    expect(d.campaignSendable).toBe(false);
    expect(d.reason).toMatch(/does not exist/i);
    // A switch that reads ON while nothing can be delivered is the thing the
    // whole automationState module exists to surface.
    expect(d.misleading).toBe(true);
  });

  it("a healthy automation is untouched", () => {
    const d = diagnoseAutomation(AUTOMATION_EVENTS_BY_KEY["attendance_absent"], {
      setting: { enabled: true },
    });
    expect(d.state).toBe("ACTIVE");
    expect(d.campaign).toBe("smartark_attendance_absent");
    expect(d.campaignSendable).toBe(true);
  });

  it("reports which campaign each automation would actually post to", () => {
    // Previously unanswerable from the UI: the campaign was computed inside the
    // enqueue path and never surfaced.
    const d = diagnoseAutomation(AUTOMATION_EVENTS_BY_KEY["fee_paid"], {
      setting: { enabled: true },
    });
    expect(d.campaign).toBe("smartark_fee_receipt");
  });
});

describe("the branding leak is measured, not estimated", () => {
  it("names the campaigns that send one tenant's identity to everyone", () => {
    const leaked = brandedCampaigns().map((c) => c.name);
    // The lead funnel is the live leak: these four have delivered real
    // messages and none of them takes an org_name parameter.
    expect(leaked).toContain("lead_welcome");
    expect(leaked).toContain("lead_assigned_counselor");
    expect(leaked).toContain("lead_demo_scheduled_v2");
    // Attendance and fees have been cut over to organization-neutral
    // campaigns, so their replacements must NOT be on this list.
    expect(leaked).not.toContain("smartark_attendance_absent");
    expect(leaked).not.toContain("smartark_fee_receipt");
  });

  it("every lead template has an organization-neutral replacement registered", () => {
    // The user-facing ask: the enquiry funnel has to work for every tenant.
    // Each branded lead campaign must have a smartark_ successor whose last
    // parameter carries the institution name.
    const leadCampaigns = Object.values(LEAD_TEMPLATES).map((t) => t.providerName);
    const replaced = new Set(PROVIDER_TEMPLATES.map((t) => t.legacyCampaign));
    // lead_low_performance / lead_unassigned_alert are internal staff nudges
    // with no positional spec and no Meta template — excluded deliberately.
    const INTERNAL_ONLY = new Set(["lead_low_performance", "lead_unassigned_alert"]);
    for (const c of leadCampaigns) {
      if (INTERNAL_ONLY.has(c)) continue;
      expect(replaced, `lead campaign "${c}" has no organization-neutral successor`)
        .toContain(c);
    }
  });

  it("every replacement ends with org_name and stays UTILITY", () => {
    for (const t of PROVIDER_TEMPLATES.filter((x) => x.campaign.startsWith("smartark_lead_"))) {
      expect(t.params[t.params.length - 1]).toBe("org_name");
      // A MARKETING template needs opt-in consent and is rate-limited; a
      // transactional enquiry acknowledgement sent as MARKETING is both a
      // compliance problem and a deliverability one.
      expect(t.category, `${t.campaign} must be UTILITY`).toBe("UTILITY");
    }
  });

  it("no replacement body uses the register that gets a UTILITY template reclassified", () => {
    // Meta recategorises on CONTENT. The legacy lead bodies say "Welcome to",
    // "We look forward to" and end on an exclamation mark — marketing register
    // in a template we need approved as transactional.
    for (const t of PROVIDER_TEMPLATES.filter((x) => x.campaign.startsWith("smartark_lead_"))) {
      expect(t.body, `${t.campaign} reads as marketing`).not.toMatch(/look forward/i);
      expect(t.body, `${t.campaign} reads as marketing`).not.toMatch(/!/);
      expect(t.body, `${t.campaign} contains a URL`).not.toMatch(/https?:\/\//);
      // Every body opens on static text. A template that begins with a
      // parameter is a documented Meta rejection trigger.
      expect(t.body.trimStart().startsWith("{{"), `${t.campaign} opens on a parameter`)
        .toBe(false);
    }
  });
});

describe("cutover is atomic — the local body follows the approved one", () => {
  // ┌── THE HALF-CUTOVER THIS PREVENTS ──────────────────────────────────────┐
  // │ Flipping a status to ACTIVE changes what META renders. It does not     │
  // │ change the local body, which is what the preview shows, what the email │
  // │ carries, and what lands in message_queue.__body and                    │
  // │ lead_whatsapp_logs.message_body as the record of what was sent.        │
  // │                                                                        │
  // │ So a one-line status edit can leave the audit trail describing a       │
  // │ message that was never delivered. The three templates cut over so far  │
  // │ all had their bodies updated in the same commit — by hand, by          │
  // │ remembering. This makes it a build failure instead.                    │
  // │                                                                        │
  // │ It is also what forces the seven lead bodies to be rewritten at the    │
  // │ moment their campaigns are approved, rather than churning them now     │
  // │ while the legacy campaigns are still the ones sending.                 │
  // └────────────────────────────────────────────────────────────────────────┘
  const local = (key: string): string | undefined =>
    BUILTIN_TEMPLATES_BY_KEY[key]?.body ??
    (LEAD_TEMPLATES as Record<string, { body: string } | undefined>)[key]?.body;

  /** The submitted body with {{1}}… replaced by the names it declares. */
  const named = (body: string, params: string[]): string =>
    body.replace(/\{\{(\d+)\}\}/g, (_, n) => `{{${params[Number(n) - 1]}}}`);

  const ACTIVE = PROVIDER_TEMPLATES.filter((t) => t.status === "ACTIVE");

  it("there is something to check", () => {
    expect(ACTIVE.length, "no ACTIVE templates — this gate has gone vacuous")
      .toBeGreaterThan(0);
  });

  it.each(ACTIVE.map((t) => [t.key, t] as const))(
    "%s renders locally exactly what Meta was given",
    (key, t) => {
      const body = local(key);
      expect(body, `no local template body for "${key}"`).toBeTruthy();
      expect(
        body,
        `"${key}" is ACTIVE, so ${t.campaign}'s approved body is what WhatsApp ` +
          `delivers — but the local body differs, so every preview, email and ` +
          `audit row describes a different message from the one that was sent`,
      ).toBe(named(t.body, t.params));
    },
  );
});

describe("the dead list is short and actionable", () => {
  it("every refused campaign says what to do about it", () => {
    const dead = deadCampaigns();
    expect(dead.length, "no refused campaigns recorded — the ledger has gone stale")
      .toBeGreaterThan(0);
    for (const r of dead) {
      const v = campaignVerdict(r.name);
      expect(v.sendable).toBe(false);
      expect(v.blockedReason, `${r.name} is refused with no guidance`).toBeTruthy();
    }
  });

  it("a rejected Meta name is never resubmitted", () => {
    // Both credential templates were rejected. A rejected name is burned — a
    // resubmission under the same name cannot be approved, so the registry
    // must never resolve to one.
    for (const t of PROVIDER_TEMPLATES) {
      const v = campaignVerdict(t.campaign);
      if (v.existence !== "REJECTED") continue;
      expect(
        resolveCampaign(t.key)?.campaign,
        `${t.campaign} was rejected by Meta but the resolver still returns it`,
      ).not.toBe(t.campaign);
    }
  });
});
