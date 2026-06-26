import { describe, it, expect } from "vitest";

import {
  computeTemplateStatus,
  computeReadiness,
} from "../utils/deploymentStatus";
import { DEPLOYMENT_REGISTRY, DEPLOYMENT_REGISTRY_BY_KEY } from "../constants/deploymentRegistry";
import { BUILTIN_TEMPLATES_BY_KEY } from "../utils/whatsappTemplates";

// ════════════════════════════════════════════════════════════════════════════
// DEPLOYMENT MANAGER QA — verifies the real classification + scoring used by the
// Communication Deployment Manager. No fake success: the same functions the UI
// renders are exercised here.
// ════════════════════════════════════════════════════════════════════════════

describe("deployment registry integrity", () => {
  it("every wired template exists in the builtin/template registry", () => {
    for (const m of DEPLOYMENT_REGISTRY) {
      // salary_slip is an email template rendered server-side; the rest are WA.
      if (m.wired && m.channel === "whatsapp") {
        expect(BUILTIN_TEMPLATES_BY_KEY[m.key], `missing builtin: ${m.key}`).toBeTruthy();
      }
    }
  });

  it("has no duplicate keys", () => {
    const keys = DEPLOYMENT_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("computeTemplateStatus", () => {
  const wired = DEPLOYMENT_REGISTRY_BY_KEY["inquiry_followup"];

  it("missing when not seeded in comms_templates", () => {
    expect(computeTemplateStatus(wired, { inDb: false, sent: 0, failed: 0 }).status).toBe("missing");
  });

  it("needs_approval when wired WhatsApp template never sent", () => {
    expect(computeTemplateStatus(wired, { inDb: true, sent: 0, failed: 0 }).status).toBe("needs_approval");
  });

  it("live when wired + seeded + sent with no failures", () => {
    expect(computeTemplateStatus(wired, { inDb: true, sent: 5, failed: 0 }).status).toBe("live");
  });

  it("production_ready when sent but with some failures", () => {
    expect(computeTemplateStatus(wired, { inDb: true, sent: 5, failed: 2 }).status).toBe("production_ready");
  });

  it("not_tested when unwired but seeded", () => {
    const unwired = DEPLOYMENT_REGISTRY_BY_KEY["task_reminder"];
    expect(computeTemplateStatus(unwired, { inDb: true, sent: 0, failed: 0 }).status).toBe("not_tested");
  });
});

describe("computeReadiness", () => {
  it("zeroes infrastructure and flags blockers when the queue is unreachable", () => {
    const r = computeReadiness({
      queueReachable: false,
      aliasesAvailable: false,
      totalTemplates: 25,
      seededTemplates: 0,
      wiredTemplates: 12,
      testedTemplates: 0,
    });
    expect(r.categories.find((c) => c.name === "Infrastructure")?.pct).toBe(0);
    expect(r.blockers.some((b) => b.includes("message_queue"))).toBe(true);
    expect(r.overall).toBeLessThan(50);
  });

  it("marks live categories as unknown until probed", () => {
    const r = computeReadiness({
      queueReachable: true,
      aliasesAvailable: true,
      totalTemplates: 25,
      seededTemplates: 25,
      wiredTemplates: 12,
      testedTemplates: 12,
    });
    const edge = r.categories.find((c) => c.name === "Edge Functions");
    expect(edge?.pct).toBeNull();
    // measurable categories (infra/templates/tests) are all 100 here.
    expect(r.overall).toBe(100);
  });

  it("computes a partial overall from measurable categories", () => {
    const r = computeReadiness({
      queueReachable: true,
      aliasesAvailable: true,
      totalTemplates: 25,
      seededTemplates: 20, // 80%
      wiredTemplates: 12,
      testedTemplates: 9, // 75%
      edgeOk: true, // 100
      secretsOk: true, // 100
      cronOk: true, // 100
      providersOk: true, // 100
    });
    // infra 100, templates 80, edge 100, secrets 100, cron 100, providers 100, tests 75
    expect(r.overall).toBe(Math.round((100 + 80 + 100 + 100 + 100 + 100 + 75) / 7));
  });
});
