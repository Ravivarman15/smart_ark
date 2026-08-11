import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROVIDER_TEMPLATES,
  PROVIDER_TEMPLATES_BY_KEY,
  resolveCampaign,
  isBrandingLeaked,
} from "../constants/providerTemplates";
import { buildTemplateParams } from "@/features/leads/utils/templateParams";

// ════════════════════════════════════════════════════════════════════════════
// PHASE E — MULTI-TENANT PROVIDER TEMPLATES
//
// The correction this phase rests on: send-aisensy posts
// { campaignName, templateParams }, and META renders its own approved body.
// The body in this repository never reaches WhatsApp for a template with a
// positional spec. So `ark_attendance_absent`, whose approved Meta body ends
// "Thank you, ARK Learning Arena", sends ARK's name to every tenant's parents
// regardless of what the local template says.
//
// These gates protect the migration: correct parameter order, no premature
// cutover, and no drift between the app and its Deno mirror.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Parameter order is append-only", () => {
  it("org_name is always the LAST positional parameter", () => {
    // Inserting it anywhere else shifts every later parameter — Meta would
    // render a date where a name belongs, to a real parent.
    for (const t of PROVIDER_TEMPLATES) {
      expect(t.params[t.params.length - 1], `${t.campaign} does not end with org_name`)
        .toBe("org_name");
    }
  });

  it("no parameter is used more than once", () => {
    // META REJECTED smartark_staff_credentials and smartark_student_credentials
    // for exactly this. Both bodies named the organization mid-sentence AND in
    // the sign-off, so {{6}} appeared twice. Meta requires each parameter to
    // appear exactly once.
    for (const t of PROVIDER_TEMPLATES) {
      const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      const dupes = [...new Set(used.filter((n) => used.filter((x) => x === n).length > 1))];
      expect(dupes, `${t.campaign} repeats {{${dupes.join("}}, {{")}}} — Meta rejects this`)
        .toEqual([]);
    }
  });

  it("parameters appear in ascending order", () => {
    // The second half of the same rejection: the bodies ran 1, 6, 2, 3, 4, 5, 6.
    // Meta requires the placeholders to appear in sequence, so a body that
    // jumps forward and back is rejected even without a repeat.
    for (const t of PROVIDER_TEMPLATES) {
      const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(used, `${t.campaign} parameters are out of order: ${used.join(", ")}`)
        .toEqual([...used].sort((a, b) => a - b));
    }
  });

  it("parameter numbering starts at 1 with no gaps", () => {
    // {{1}}, {{2}}, {{4}} is rejected too — Meta expects a contiguous run.
    for (const t of PROVIDER_TEMPLATES) {
      const used = [...new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))];
      expect(used.sort((a, b) => a - b), `${t.campaign} has gaps in its numbering`)
        .toEqual(Array.from({ length: used.length }, (_, i) => i + 1));
    }
  });

  it("the submitted body references every parameter exactly once, in order", () => {
    for (const t of PROVIDER_TEMPLATES) {
      for (let i = 1; i <= t.params.length; i++) {
        expect(t.body, `${t.campaign} body never uses {{${i}}}`).toContain(`{{${i}}}`);
      }
      // A higher index than declared means the body expects a parameter the
      // ERP will never send — Meta rejects the send outright.
      const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(Math.max(...used), `${t.campaign} uses a parameter beyond its declared count`)
        .toBeLessThanOrEqual(t.params.length);
    }
  });

  it("no submitted body contains a tenant name", () => {
    for (const t of PROVIDER_TEMPLATES) {
      expect(t.body, `${t.campaign} hardcodes a tenant`).not.toContain("ARK Learning Arena");
      expect(t.campaign, "campaign name is tenant-specific").not.toMatch(/^ark_/);
      expect(t.campaign).toMatch(/^smartark_/);
    }
  });

  it("the positional builder emits exactly the declared parameters", () => {
    // The builder is what actually posts. If it and the submitted body
    // disagree on count, every send fails at Meta.
    const payload = {
      parent_name: "Mr Kumar", student_name: "Arjun", class: "9th", section: "A",
      attendance_date: "10 Aug 2026", org_name: "ABC Academy",
      staff_name: "Priya", role: "Teacher", login_email: "a@b.c",
      password: "x", login_url: "https://example.com",
      receipt_no: "R1", amount_paid: "100", pending_balance: "0",
    };
    for (const t of PROVIDER_TEMPLATES) {
      const built = buildTemplateParams(t.campaign, payload);
      expect(built.length, `${t.campaign}: builder emits ${built.length}, body declares ${t.params.length}`)
        .toBe(t.params.length);
      // And org_name must land in the last slot, carrying the tenant's name.
      expect(built[built.length - 1]).toBe("ABC Academy");
    }
  });
});

describe("Cutover is deliberate, never accidental", () => {
  it("nothing is ACTIVE until a human approves and verifies it", () => {
    // A template marked ACTIVE in source without a real Meta approval would
    // send an unapproved campaign and can get the WhatsApp number flagged.
    for (const t of PROVIDER_TEMPLATES) {
      expect(
        ["READY_FOR_SUBMISSION", "SUBMITTED", "APPROVED"],
        `${t.campaign} is ${t.status} — was it really approved AND test-verified?`,
      ).toContain(t.status);
    }
  });

  it("a non-ACTIVE template resolves to the LEGACY campaign", () => {
    // This is what keeps ARK's production communication working untouched
    // through the whole migration.
    const r = resolveCampaign("attendance_absent");
    expect(r?.campaign).toBe("ark_attendance_absent");
    expect(r?.isMultiTenant).toBe(false);
  });

  it("an unregistered template is left completely alone", () => {
    expect(resolveCampaign("birthday_wish")).toBeNull();
  });

  it("reports honestly that branding still leaks pre-cutover", () => {
    // The system must not claim to be multi-tenant on WhatsApp while the
    // legacy ARK-branded campaign is what actually sends.
    expect(isBrandingLeaked("attendance_absent")).toBe(true);
  });
});

describe("The Deno mirror cannot drift", () => {
  // send-aisensy cannot import from src/, so templateParams.ts is duplicated by
  // hand. A spec present in one and absent from the other means the queue
  // drainer falls back to the single-body parameter and Meta rejects the send
  // for a parameter-count mismatch — at runtime, in production, silently.
  const appSpecs = read("src/features/leads/utils/templateParams.ts");
  const denoSpecs = read("supabase/functions/send-aisensy/index.ts");

  it("every multi-tenant campaign has a spec on BOTH sides", () => {
    // Matched as a WHOLE key, not a substring. `toContain(campaign)` passed
    // against `smartark_attendance_corrected_TYPO` — the typo contains the
    // correct name — so the gate reported healthy against a broken mirror.
    // Caught by mutation-testing this gate.
    for (const t of PROVIDER_TEMPLATES) {
      const appKey = new RegExp(`\\b${t.campaign}:\\s*\\(p\\)`);
      const denoKey = new RegExp(`TEMPLATE_PARAM_SPECS\\["${t.campaign}"\\]`);
      expect(appKey.test(appSpecs), `${t.campaign} missing from the app spec table`).toBe(true);
      expect(denoKey.test(denoSpecs), `${t.campaign} missing from the send-aisensy mirror`).toBe(true);
    }
  });

  it("the two sides declare the SAME parameter count", () => {
    // A count mismatch is the failure mode that actually reaches production:
    // the app renders n params, the drainer posts m, and Meta rejects the send.
    for (const t of PROVIDER_TEMPLATES) {
      // Anchor to the ARRAY opening, not the declaration.
      //   app  : `smartark_x: (p) => [ … ],`
      //   deno : `TEMPLATE_PARAM_SPECS["smartark_x"] = (p) => [ … ];`
      // Two earlier attempts got this wrong in opposite directions: ending on
      // "];" ran past the app entry and counted 29, and starting at the
      // declaration made the mirror's own `["smartark_x"]` bracket the first
      // `]` and counted 0. Both failed on CORRECT code.
      const grab = (src: string, declAt: number) => {
        if (declAt < 0) return -1;
        const open = src.indexOf("=> [", declAt);
        if (open < 0) return -1;
        const end = src.indexOf("]", open + 4);
        return (src.slice(open, end).match(/val\(p,/g) ?? []).length;
      };
      const appCount = grab(appSpecs, appSpecs.indexOf(`${t.campaign}: (p)`));
      const denoCount = grab(denoSpecs, denoSpecs.indexOf(`TEMPLATE_PARAM_SPECS["${t.campaign}"]`));
      expect(appCount, `${t.campaign}: app has ${appCount} params`).toBe(t.params.length);
      expect(denoCount, `${t.campaign}: mirror has ${denoCount}, app has ${appCount}`).toBe(appCount);
    }
  });

  it("neither side defaults the sender label to a tenant", () => {
    expect(denoSpecs, "send-aisensy labels every tenant's traffic as ARK")
      .not.toContain("ARK LEARNING ARENA");
  });
});

describe("Legacy templates are preserved, not replaced", () => {
  it("every entry names the legacy campaign it supersedes", () => {
    for (const t of PROVIDER_TEMPLATES) {
      expect(t.legacyCampaign, `${t.campaign} has no legacy predecessor recorded`).toBeTruthy();
      expect(t.legacyCampaign).not.toBe(t.campaign);
    }
  });

  it("fee_receipt records that its execution path is NOT migrated", () => {
    // feeReceiptDelivery.service is a working production flow with its own PDF
    // logic. Approving the campaign must not imply the path changed.
    const t = PROVIDER_TEMPLATES_BY_KEY["fee_receipt"];
    expect(t.note).toMatch(/LEGACY WORKING FLOW/);
  });
});
