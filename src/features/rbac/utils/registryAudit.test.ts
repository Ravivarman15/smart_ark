import { describe, it, expect } from "vitest";
import { auditRbacRegistry } from "./registryAudit";
import { MODULE_CATALOG } from "../constants/catalog";
import { ACTION_CATALOG } from "../constants/actionCatalog";

// ════════════════════════════════════════════════════════════════════════════
// RBAC REGISTRY CONSISTENCY — build gate.
//
// This test FAILS THE BUILD whenever a module / submodule / action is wired into
// navigation (or the legacy context) but not registered in the RBAC catalogs —
// the exact drift that hid Attendance & Payroll from Manage Staff Role.
//
// If you add a module and this test goes red: register it in catalog.ts +
// actionCatalog.ts (and keep menu.config in sync). That is the fix, by design.
// ════════════════════════════════════════════════════════════════════════════

describe("RBAC registry consistency", () => {
  const report = auditRbacRegistry();

  it("has NO unregistered navigation modules (catches the Attendance/Payroll bug class)", () => {
    const missingModules = report.findings.filter((f) => f.kind === "nav_module_unregistered");
    expect(missingModules, missingModules.map((f) => f.detail).join("\n")).toHaveLength(0);
  });

  it("has NO unregistered navigation submodules", () => {
    const missing = report.findings.filter((f) => f.kind === "nav_submodule_unregistered");
    expect(missing, missing.map((f) => f.detail).join("\n")).toHaveLength(0);
  });

  it("has NO navigation actions without a defining registry", () => {
    const missing = report.findings.filter((f) => f.kind === "nav_action_unregistered");
    expect(missing, missing.map((f) => f.detail).join("\n")).toHaveLength(0);
  });

  it("has NO orphan actions (every action has a catalogued parent submodule)", () => {
    const orphans = report.findings.filter((f) => f.kind === "orphan_action");
    expect(orphans, orphans.map((f) => f.detail).join("\n")).toHaveLength(0);
  });

  it("has NO duplicate module / submodule / action ids", () => {
    expect(report.duplicates, report.duplicates.map((f) => f.detail).join("\n")).toHaveLength(0);
  });

  it("registers Attendance & Payroll as grantable modules + actions", () => {
    const ids = new Set(MODULE_CATALOG.map((m) => m.id));
    expect(ids.has("attendance")).toBe(true);
    expect(ids.has("payroll")).toBe(true);
    expect(ACTION_CATALOG.some((a) => a.id.startsWith("attendance."))).toBe(true);
    expect(ACTION_CATALOG.some((a) => a.id.startsWith("payroll."))).toBe(true);
  });

  it("passes the overall audit with zero errors", () => {
    // `ok` is true only when there are no error-severity findings. Warnings
    // (e.g. intentional legacy drift) are allowed and surfaced separately.
    const errors = report.findings.filter((f) => f.severity === "error");
    expect(report.ok, errors.map((f) => `[${f.kind}] ${f.detail}`).join("\n")).toBe(true);
  });
});
