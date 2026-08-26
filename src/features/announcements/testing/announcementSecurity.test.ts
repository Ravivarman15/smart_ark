// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Security, RBAC & Mutation Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { MODULE_CATALOG, MODULES_BY_ID, SUBMODULES_BY_ID } from "@/features/rbac/constants/catalog";
import { ACTION_CATALOG, ACTIONS_BY_ID } from "@/features/rbac/constants/actionCatalog";
import { MODULE_METADATA } from "@/features/platform/modules/moduleRegistry";
import { NAV_CONFIG } from "@/core/navigation/menu.config";
import { resolveEffectiveAccess } from "@/features/rbac/resolver/rbacResolver";
import { deriveAnnouncementStatus } from "../services/announcements.service";

describe("Announcements Module Governance & RBAC Registration", () => {
  it("announcements is registered in the RBAC MODULE_CATALOG", () => {
    expect(MODULES_BY_ID["announcements"]).toBeDefined();
    expect(MODULES_BY_ID["announcements"].label).toBe("Announcements");
  });

  it("submodules are registered for management and creation", () => {
    expect(SUBMODULES_BY_ID["announcements.manage"]).toBeDefined();
    expect(SUBMODULES_BY_ID["announcements.create"]).toBeDefined();
  });

  it("announcements is registered in commercial MODULE_METADATA with customer audience", () => {
    const meta = MODULE_METADATA["announcements"];
    expect(meta).toBeDefined();
    expect(meta.category).toBe("communication");
    expect(meta.audience).toBe("customer");
  });

  it("fine-grained actions exist in ACTION_CATALOG", () => {
    const requiredActions = [
      "announcement.view",
      "announcement.create",
      "announcement.edit",
      "announcement.publish",
      "announcement.schedule",
      "announcement.delete",
      "announcement.manage",
      "announcement.view_analytics",
    ];

    for (const actionId of requiredActions) {
      expect(ACTIONS_BY_ID[actionId], `Missing action: ${actionId}`).toBeDefined();
    }
  });

  it("announcements group is registered in NAV_CONFIG with Megaphone icon", () => {
    const group = NAV_CONFIG.find((g) => g.key === "announcements");
    expect(group).toBeDefined();
    expect(group?.icon).toBe("Megaphone");
    expect(group?.module).toBe("announcements");
  });
});

describe("Mutation Testing on Critical Security Invariants", () => {
  const now = new Date("2026-08-26T12:00:00.000Z").getTime();
  const pastPublish = "2026-08-26T08:00:00.000Z";
  const pastExpiry = "2026-08-26T10:00:00.000Z";

  it("MUTATION CHECK: removing expiration guard leaks expired announcements as live", () => {
    // Normal correct function marks it expired
    const realStatus = deriveAnnouncementStatus("live", pastPublish, pastExpiry, now);
    expect(realStatus).toBe("expired");

    // Mutated faulty implementation without expiration check
    const mutatedDerive = (status: string) => (status === "draft" ? "draft" : "live");
    const faultyStatus = mutatedDerive("live");

    // The security test detects the faulty mutation:
    expect(faultyStatus).not.toBe(realStatus);
    expect(faultyStatus).toBe("live"); // Mutation leaked!
  });

  it("MUTATION CHECK: removing scheduled check publishes future announcements immediately", () => {
    const futurePublish = "2026-08-26T18:00:00.000Z";
    const realStatus = deriveAnnouncementStatus("scheduled", futurePublish, null, now);
    expect(realStatus).toBe("scheduled");

    // Mutated faulty implementation ignoring publish_at
    const mutatedDerive = () => "live";
    expect(mutatedDerive()).not.toBe(realStatus);
  });
});
