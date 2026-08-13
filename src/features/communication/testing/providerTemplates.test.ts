import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROVIDER_TEMPLATES,
  PROVIDER_TEMPLATES_BY_KEY,
  resolveCampaign,
  isBrandingLeaked,
} from "../constants/providerTemplates";
import { buildTemplateParams, POSITIONAL_TEMPLATES } from "@/features/leads/utils/templateParams";

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
  // ┌── THESE ASSERTIONS CHANGED AT THE 2026-08-13 CUTOVER ──────────────────┐
  // │ They used to assert that NOTHING was ACTIVE — a tripwire for the whole │
  // │ pre-approval period. Meta has now approved the attendance and fee      │
  // │ campaigns, so that assertion has served its purpose and would only     │
  // │ block the change it was written to guard.                              │
  // │                                                                        │
  // │ It was replaced rather than deleted. The risk it covered — a template  │
  // │ reaching ACTIVE without the surrounding machinery being right — is     │
  // │ still real, so what is asserted now is every precondition an ACTIVE    │
  // │ template must satisfy to be safe to send.                              │
  // └────────────────────────────────────────────────────────────────────────┘

  it("every ACTIVE template satisfies all its send preconditions", () => {
    for (const t of PROVIDER_TEMPLATES.filter((x) => x.status === "ACTIVE")) {
      // A legacy predecessor must still be recorded: it is the rollback.
      expect(t.legacyCampaign, `${t.campaign} has no legacy campaign to roll back to`).toBeTruthy();
      expect(t.legacyCampaign).not.toBe(t.campaign);
      // Both sides must be able to build its parameters, or the send posts
      // the whole body as a single {{1}} and Meta rejects it.
      expect(POSITIONAL_TEMPLATES, `${t.campaign} has no app-side spec`).toContain(t.campaign);
      // The declared order must be append-only over the legacy one.
      expect(t.params[t.params.length - 1], `${t.campaign} must end with org_name`).toBe("org_name");
    }
  });

  it("no template is ACTIVE and REJECTED at once", () => {
    // The two credential campaigns were rejected by Meta. Marking one ACTIVE
    // would send an unapproved campaign and can get the number flagged.
    for (const t of PROVIDER_TEMPLATES) {
      expect(["LEGACY", "READY_FOR_SUBMISSION", "SUBMITTED", "APPROVED", "ACTIVE", "REJECTED", "DISABLED"])
        .toContain(t.status);
    }
    const rejected = PROVIDER_TEMPLATES.filter((t) => t.status === "REJECTED");
    for (const t of rejected) {
      expect(resolveCampaign(t.key)?.campaign, `${t.campaign} was REJECTED but still resolves to itself`)
        .toBe(t.legacyCampaign);
      // A rejection must carry its reason, so nobody resubmits the same design
      // and burns another campaign name.
      expect(t.note, `${t.campaign} is REJECTED with no reason recorded`).toBeTruthy();
      expect(t.note!.toUpperCase()).toContain("DO NOT RESUBMIT");
    }
  });

  it("a non-ACTIVE template resolves to the LEGACY campaign", () => {
    // Still the mechanism that keeps a live flow working when a template is
    // not approved — now demonstrated on the rejected credential campaign,
    // which is the case that actually depends on it today.
    const r = resolveCampaign("staff_credentials");
    expect(r?.status).toBe("REJECTED");
    expect(r?.campaign).toBe("staff_credentials");
    expect(r?.isMultiTenant).toBe(false);
  });

  it("an ACTIVE template resolves to the multi-tenant campaign", () => {
    const r = resolveCampaign("attendance_absent");
    expect(r?.campaign).toBe("smartark_attendance_absent");
    expect(r?.isMultiTenant).toBe(true);
  });

  it("an unregistered template is left completely alone", () => {
    expect(resolveCampaign("birthday_wish")).toBeNull();
  });

  it("reports branding leakage accurately per template", () => {
    // The system must never claim to be multi-tenant on WhatsApp while a
    // legacy single-tenant campaign is what actually sends.
    expect(isBrandingLeaked("attendance_absent"), "attendance is cut over").toBe(false);
    expect(isBrandingLeaked("staff_credentials"), "credentials still send the legacy body").toBe(true);
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
        // Case-INSENSITIVE on the accessor name, and this matters.
        //
        // The app side calls `val(p, …)`; the Deno mirror's accessor is
        // `tVal(p, …)`. This pattern used to be a bare /val\(p,/ — which does
        // not match `tVal(p,` because the V is capitalised — and it PASSED,
        // because the mirror's five smartark_* builders had been written
        // calling `val(...)`, an identifier that does not exist in that file.
        // Every one of them would have thrown `ReferenceError: val is not
        // defined` on the first send after a cutover.
        //
        // So the gate was green BECAUSE of the bug: the typo it should have
        // caught was the very thing that satisfied its regex. Fixing the
        // identifier turned this test red, which is how the assumption
        // surfaced. Matching either spelling is what makes it independent of
        // which accessor a file happens to use.
        return (src.slice(open, end).match(/\b[A-Za-z]*[vV]al\(p,/g) ?? []).length;
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

  it("the mirror calls an accessor that actually exists in its own file", () => {
    // The bug the count test above was blind to: all five smartark_* builders
    // called `val(...)`, which is defined in templateParams.ts and NOT in
    // send-aisensy — 29 call sites of an undefined identifier. Deno resolves
    // an arrow-function body at CALL time, so the function deployed cleanly
    // and worked, purely because no smartark_* campaign was ACTIVE. The first
    // send after any cutover would have thrown.
    const code = denoSpecs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const called = new Set(
      [...code.matchAll(/(?:^|[^A-Za-z0-9_$.])([A-Za-z_$][\w$]*)\(p,/g)].map((m) => m[1]),
    );
    for (const fn of called) {
      expect(
        new RegExp(`(?:const|let|var|function)\\s+${fn}\\b`).test(code),
        `send-aisensy calls ${fn}(p, …) but never defines it — every spec using ` +
          `it throws ReferenceError on the first send`,
      ).toBe(true);
    }
    expect(called.size, "no parameter builders found — the scan is vacuous").toBeGreaterThan(0);
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

// ── The lifecycle must actually govern what is sent ─────────────────────────
//
// ┌── THE PRODUCTION DEFECT THIS CATCHES ──────────────────────────────────┐
// │ Marking a student absent in ABC Academi's portal sent ARK's approved   │
// │ Meta body, signed "Thank you, ARK Learning Arena", to ABC's parents.   │
// │                                                                        │
// │ Not because a status was wrong — because attendanceWhatsapp.service    │
// │ posted `template.providerName`, the hardcoded `ark_attendance_absent`  │
// │ in whatsappTemplates.ts, and never called resolveCampaign() at all.    │
// │ The whole READY_FOR_SUBMISSION → ACTIVE lifecycle was decorative for   │
// │ the highest-volume automation on the platform: flipping a status       │
// │ changed nothing, because nothing on that path read it.                 │
// └────────────────────────────────────────────────────────────────────────┘
describe("every provider send path consults the lifecycle", () => {
  const ROOT = join(__dirname, "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

  // Files that choose a `campaignName` and hand it to a provider.
  const SEND_PATHS = [
    "src/features/attendance/automation/services/attendanceWhatsapp.service.ts",
    "src/features/communication/services/aisensy.service.ts",
  ];

  it.each(SEND_PATHS)("%s resolves the campaign rather than hardcoding it", (path) => {
    const src = read(path);
    expect(src, `${path} chooses a campaign without consulting resolveCampaign()`)
      .toMatch(/resolveCampaign\(/);
  });

  it.each(SEND_PATHS)("%s never posts template.providerName as the campaign", (path) => {
    const src = read(path);
    // `providerName` may still appear as a FALLBACK after the resolver; what
    // must not happen is it being the primary choice.
    expect(src).not.toMatch(/campaignName:\s*template\.providerName\s*\?\?/);
  });

  it("builds parameters against the resolved campaign, not the template key", () => {
    // `attendance_absent` declares 5 parameters; `smartark_attendance_absent`
    // declares 6. Building against the key would post 5 values into a
    // 6-parameter template and Meta would reject the send.
    const src = read(SEND_PATHS[0]);
    expect(src).toMatch(/buildTemplateParams\(campaignName,/);
  });

  it("every legacy campaign name has a parameter spec", () => {
    // The switch to campaign-name lookup silently breaks any campaign without
    // a spec: buildTemplateParams falls back to one {{1}} carrying the whole
    // body, and a live five-parameter template starts receiving one parameter.
    for (const t of PROVIDER_TEMPLATES) {
      expect(
        POSITIONAL_TEMPLATES,
        `legacy campaign "${t.legacyCampaign}" has no parameter spec — sends would ` +
          `silently degrade to a single-body parameter`,
      ).toContain(t.legacyCampaign);
      expect(
        POSITIONAL_TEMPLATES,
        `new campaign "${t.campaign}" has no parameter spec`,
      ).toContain(t.campaign);
    }
  });

  it("the legacy and new specs differ by exactly the org_name parameter", () => {
    for (const t of PROVIDER_TEMPLATES) {
      const legacy = buildTemplateParams(t.legacyCampaign, SAMPLE);
      const neutral = buildTemplateParams(t.campaign, SAMPLE);
      expect(
        neutral.length,
        `${t.campaign} must take exactly one more parameter than ${t.legacyCampaign}`,
      ).toBe(legacy.length + 1);
      expect(t.params.length, `${t.campaign} declares ${t.params.length} params`).toBe(neutral.length);
      // Append-only: the legacy order is preserved verbatim and org_name is last.
      expect(neutral.slice(0, legacy.length)).toEqual(legacy);
      expect(neutral[neutral.length - 1]).toBe(SAMPLE.org_name);
    }
  });
});

/** One value per variable any provider template names, so no param is empty. */
const SAMPLE: Record<string, string> = {
  parent_name: "Mr. Kumar", student_name: "Arjun", staff_name: "Priya S",
  class: "9th Standard", section: "A", attendance_date: "10 Aug 2026",
  role: "Teacher", login_email: "priya@example.com", username: "priya@example.com",
  password: "Tmp#4821", login_url: "https://example.com/login",
  receipt_no: "RCP-2026-0417", amount_paid: "12,400", pending_balance: "3,600",
  org_name: "Example Institute",
};
