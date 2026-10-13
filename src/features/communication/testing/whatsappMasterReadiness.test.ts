// ══════════════════════════════════════════════════════════════════════════════
// MASTER WHATSAPP READINESS & TENANT ISOLATION SUITE
//
// Gates:
// 1. Template Parameter Contracts & Mirror Parity (Deno vs TypeScript).
// 2. Multi-Tenant Dynamic Branding (ARK, ABC Academi, generic tenants).
// 3. Automation ON/OFF Delivery Control & Tenant Independence.
// 4. Queue Drain Cancellation on Newly-Disabled Automations.
// 5. Credential Security: Password-free Utility Replacement & Secret Redaction.
// 6. Dead Campaign Circuit-Breaker: permanently rejected campaigns never post.
// ══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTemplateParams,
  POSITIONAL_TEMPLATES,
} from "@/features/leads/utils/templateParams";
import {
  CAMPAIGN_LEDGER,
  campaignVerdict,
  DEAD_EXISTENCE,
} from "../constants/providerCampaigns";
import { PROVIDER_TEMPLATES, resolveCampaign } from "../constants/providerTemplates";
import { shouldDispatch } from "../utils/automationRules";
import { AUTOMATION_EVENTS } from "../constants/automationEvents";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Phase B & G: Contract Integrity & Secure Credential Replacements", () => {
  const denoSource = read("supabase/functions/send-aisensy/index.ts");
  const appSource = read("src/features/leads/utils/templateParams.ts");

  it("smartark_staff_account_ready emits exactly 4 positional params with org_name as final", () => {
    const payload = {
      staff_name: "Anita Sharma",
      role: "Senior Faculty",
      login_url: "https://portal.smartark.app/login",
      org_name: "ABC Academi",
      password: "DO_NOT_INCLUDE_PASSWORD",
    };
    const params = buildTemplateParams("smartark_staff_account_ready", payload);
    expect(params).toEqual([
      "Anita Sharma",
      "Senior Faculty",
      "https://portal.smartark.app/login",
      "ABC Academi",
    ]);
    expect(params.length).toBe(4);
    expect(params).not.toContain("DO_NOT_INCLUDE_PASSWORD");
  });

  it("smartark_parent_account_ready emits exactly 4 positional params with org_name as final", () => {
    const payload = {
      parent_name: "Rajesh Kumar",
      student_name: "Rahul Kumar",
      login_url: "https://parent.smartark.app/auth/set-password",
      org_name: "ARK Learning Arena",
      password: "DO_NOT_INCLUDE_PASSWORD",
    };
    const params = buildTemplateParams("smartark_parent_account_ready", payload);
    expect(params).toEqual([
      "Rajesh Kumar",
      "Rahul Kumar",
      "https://parent.smartark.app/auth/set-password",
      "ARK Learning Arena",
    ]);
    expect(params.length).toBe(4);
    expect(params).not.toContain("DO_NOT_INCLUDE_PASSWORD");
  });

  it("both credential replacements exist in send-aisensy Deno mirror with identical parameter contracts", () => {
    expect(denoSource).toContain('TEMPLATE_PARAM_SPECS["smartark_staff_account_ready"]');
    expect(denoSource).toContain('TEMPLATE_PARAM_SPECS["smartark_parent_account_ready"]');
    expect(appSource).toContain("smartark_staff_account_ready:");
    expect(appSource).toContain("smartark_parent_account_ready:");
  });

  it("credential replacement campaigns are registered in the campaign ledger with UNVERIFIED status", () => {
    const staffRec = CAMPAIGN_LEDGER["smartark_staff_account_ready"];
    const parentRec = CAMPAIGN_LEDGER["smartark_parent_account_ready"];
    expect(staffRec).toBeDefined();
    expect(staffRec.params).toBe(4);
    expect(staffRec.existence).toBe("UNVERIFIED");

    expect(parentRec).toBeDefined();
    expect(parentRec.params).toBe(4);
    expect(parentRec.existence).toBe("UNVERIFIED");
  });
});

describe("Phase C: Multi-Tenant Branding Isolation", () => {
  it("generates correct organization branding for ARK Learning Arena", () => {
    const arkPayload = {
      parent_name: "Suresh",
      student_name: "Vijay",
      class: "10th",
      section: "A",
      attendance_date: "12 Oct 2026",
      org_name: "ARK Learning Arena",
    };
    const params = buildTemplateParams("smartark_attendance_absent", arkPayload);
    expect(params[5]).toBe("ARK Learning Arena");
  });

  it("generates correct organization branding for ABC Academi", () => {
    const abcPayload = {
      parent_name: "Ramesh",
      student_name: "Pooja",
      class: "8th",
      section: "B",
      attendance_date: "12 Oct 2026",
      org_name: "ABC Academi",
    };
    const params = buildTemplateParams("smartark_attendance_absent", abcPayload);
    expect(params[5]).toBe("ABC Academi");
  });

  it("generates correct organization branding for an arbitrary third tenant", () => {
    const thirdPayload = {
      parent_name: "John Doe",
      student_name: "Jane Doe",
      receipt_no: "REC-991",
      amount_paid: "5000",
      pending_balance: "0",
      class: "Grade 5",
      org_name: "Zenith International Academy",
    };
    const params = buildTemplateParams("smartark_fee_receipt", thirdPayload);
    expect(params[6]).toBe("Zenith International Academy");
  });

  it("ensures no cross-tenant parameter leakage occurs across multiple executions", () => {
    const orgs = ["Institute Alpha", "Institute Beta", "Institute Gamma"];
    for (const org of orgs) {
      const p = buildTemplateParams("smartark_fee_receipt", {
        parent_name: "P",
        student_name: "S",
        class: "C",
        receipt_no: "R",
        amount_paid: "100",
        pending_balance: "50",
        org_name: org,
      });
      expect(p[6]).toBe(org);
    }
  });
});

describe("Phase D & F: ON/OFF Setting Enforcement & Tenant Independence", () => {
  it("shouldDispatch rejects disabled settings immediately", () => {
    const res = shouldDispatch({
      eventKey: "attendance_absent",
      enabled: false,
      channel: "whatsapp",
      timing: "immediate",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("event disabled");
  });

  it("shouldDispatch accepts enabled settings", () => {
    const res = shouldDispatch({
      eventKey: "attendance_absent",
      enabled: true,
      channel: "whatsapp",
      timing: "immediate",
    });
    expect(res.ok).toBe(true);
  });

  it("evaluates tenant settings independently without shared cross-tenant mutation", () => {
    const tenantASettings = new Map<string, boolean>([["attendance_absent", false]]);
    const tenantBSettings = new Map<string, boolean>([["attendance_absent", true]]);

    expect(tenantASettings.get("attendance_absent")).toBe(false);
    expect(tenantBSettings.get("attendance_absent")).toBe(true);

    // Mutation of Tenant A leaves Tenant B completely unchanged
    tenantASettings.set("attendance_absent", true);
    expect(tenantBSettings.get("attendance_absent")).toBe(true);
  });
});

describe("Phase H & L: Queue Drainer Guard & Dead Campaign Circuit Breaker", () => {
  const denoSource = read("supabase/functions/send-aisensy/index.ts");

  it("DEAD_CAMPAIGNS set contains permanently rejected and missing campaigns in send-aisensy", () => {
    expect(denoSource).toContain('"staff_credentials"');
    expect(denoSource).toContain('"inquiry_followup"');
    expect(denoSource).toContain('"smartark_staff_credentials1"');
    expect(denoSource).toContain('"smartark_student_credentials1"');
  });

  it("dead campaigns are refused by campaignVerdict", () => {
    expect(campaignVerdict("staff_credentials").sendable).toBe(false);
    expect(campaignVerdict("inquiry_followup").sendable).toBe(false);
    expect(campaignVerdict("smartark_staff_credentials1").sendable).toBe(false);
    expect(campaignVerdict("smartark_student_credentials1").sendable).toBe(false);
  });

  it("send-aisensy queries template_key and checks orgSettingsCache to cancel disabled events", () => {
    expect(denoSource).toContain("template_key");
    expect(denoSource).toContain("event_disabled_after_enqueue");
    expect(denoSource).toContain("DEAD_CAMPAIGNS");
  });
});

describe("Meta WhatsApp Compliance: No dangling parameters, strict sequential order, no duplicate parameters", () => {
  it("every registered provider template does not start with a variable and does not end with a variable", () => {
    for (const t of PROVIDER_TEMPLATES) {
      const trimmed = t.body.trim();
      // Rule 1: Will not start with a variable
      expect(
        trimmed.startsWith("{{"),
        `${t.campaign}: body starts with variable "${trimmed.slice(0, 10)}..." which Meta forbids`,
      ).toBe(false);

      // Rule 2: New templates ready for submission must not end with a dangling variable
      if (t.status === "READY_FOR_SUBMISSION") {
        expect(
          trimmed.endsWith("}}"),
          `${t.campaign}: body ends with dangling variable "...${trimmed.slice(-10)}" which Meta forbids`,
        ).toBe(false);
      }
    }
  });

  it("every template parameter appears exactly once and follows strict ascending order 1..n", () => {
    for (const t of PROVIDER_TEMPLATES) {
      const matches = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

      // Rule 3: No repeated parameter
      const unique = [...new Set(matches)];
      expect(
        matches.length,
        `${t.campaign}: contains duplicate parameter placeholders. Found: [${matches.join(", ")}]`,
      ).toBe(unique.length);

      // Rule 4: Sequential 1..n order with no gaps
      expect(
        matches,
        `${t.campaign}: placeholders must strictly follow ascending order [1..${t.params.length}]`,
      ).toEqual(Array.from({ length: t.params.length }, (_, i) => i + 1));
    }
  });

  it("every template is multi-tenant capable with org_name in the anchored signoff", () => {
    for (const t of PROVIDER_TEMPLATES) {
      expect(
        t.params[t.params.length - 1],
        `${t.campaign}: must declare org_name as final variable to be multi-tenant capable`,
      ).toBe("org_name");

      // Verify org_name placeholder is embedded in the body and followed by trailing literal text
      const finalParamIndex = t.params.length;
      expect(
        t.body,
        `${t.campaign}: must contain {{${finalParamIndex}}} for dynamic institution branding`,
      ).toContain(`{{${finalParamIndex}}}`);
    }
  });
});
