// ════════════════════════════════════════════════════════════════════════════
// ENTITLEMENT AT THE ROUTE BOUNDARY
//
// ┌── THE DEFECT ──────────────────────────────────────────────────────────┐
// │ A Super Admin revokes Payroll from an organization. RoleSidebar hides   │
// │ the link, the platform console shows OFF, and the entitlement resolver  │
// │ correctly reports `payroll: false`.                                     │
// │                                                                         │
// │ Then a management user types /management/payroll/dashboard and gets the │
// │ entire module.                                                          │
// │                                                                         │
// │ Because LayoutAccessGate opened with:                                   │
// │                                                                         │
// │     if (data.isSuper) return { allow: true };                           │
// │                                                                         │
// │ and SUPER_ROLES is exactly ["management"] — the role a school's own      │
// │ administrator actually uses. Every revoke was cosmetic for the one role  │
// │ most likely to go looking, and ProtectedRoute above it checks nothing    │
// │ but the role name.                                                      │
// │                                                                         │
// │ The resolver was never wrong. It applies the entitlement gate ABOVE its  │
// │ super-role branch and had been returning `entitlementDenied()` all       │
// │ along. The gate simply never asked.                                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Two levels are pinned here, deliberately:
//   • BEHAVIOUR — render the gate and assert what a user reaches.
//   • SOURCE    — assert the specific short-circuit never comes back.
//
// The behavioural test is the real one. The source test exists because that
// single line is a natural thing to "restore" while fixing an unrelated
// permission bug, and it would silently reopen the hole.
// ════════════════════════════════════════════════════════════════════════════

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resolveAccess } from "../resolver/rbacResolver";
import type { EffectiveAccess } from "../types/rbac.types";

const ROOT = join(__dirname, "..", "..", "..", "..");
const GATE_FILE = readFileSync(
  join(ROOT, "src/features/rbac/components/LayoutAccessGate.tsx"),
  "utf8",
);

/**
 * The gate's CODE, with comments stripped.
 *
 * The header discusses the removed short-circuit at length and quotes it
 * verbatim, so scanning the raw file made the source test fail against a
 * correct implementation — the documentation of the fix looked like the bug.
 * Caught by this test failing on its own first green run.
 */
const GATE_SRC = GATE_FILE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ── Test doubles ────────────────────────────────────────────────────────────
// Only the gate's three collaborators are mocked. The RESOLVER is the real
// one, so the test proves the actual production precedence rather than a
// convenient fiction about it.
const accessState: { data: EffectiveAccess; isLoading: boolean } = {
  data: {} as EffectiveAccess,
  isLoading: false,
};

vi.mock("../hooks/useEffectiveAccess", () => ({
  useEffectiveAccess: () => accessState,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: "management" } }),
}));

vi.mock("@/core/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/navigation")>();
  return { ...actual, useHomeRoute: () => "/management" };
});

const { LayoutAccessGate } = await import("../components/LayoutAccessGate");

/** Real resolver output for a management user with the given entitlements. */
const accessFor = (moduleEntitlements: Record<string, boolean>): EffectiveAccess =>
  resolveAccess({
    role: "management",
    moduleEntitlements,
    rolePermissions: [],
    userOverrides: [],
  } as never);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LayoutAccessGate>
        <div>MODULE CONTENT</div>
      </LayoutAccessGate>
    </MemoryRouter>,
  );

beforeEach(() => {
  accessState.isLoading = false;
});

describe("a revoked module cannot be reached by typing its URL", () => {
  it("blocks a management user — the role the old bypass exempted", () => {
    accessState.data = accessFor({ payroll: false });
    renderAt("/management/payroll/dashboard");

    expect(screen.queryByText("MODULE CONTENT")).toBeNull();
    expect(screen.getByText(/is not enabled/i)).toBeTruthy();
  });

  it("still serves the module when the organization has it", () => {
    accessState.data = accessFor({ payroll: true });
    renderAt("/management/payroll/dashboard");

    expect(screen.getByText("MODULE CONTENT")).toBeTruthy();
  });

  it("blocks every page under the module, not just the one the menu links", () => {
    // The revoke is a fact about the module, so a nested tab or a detail route
    // nobody put in the menu must be covered too — otherwise the block is a
    // maze the determined user walks around.
    accessState.data = accessFor({ payroll: false });
    renderAt("/management/payroll/salary-register");

    expect(screen.queryByText("MODULE CONTENT")).toBeNull();
    expect(screen.getByText(/is not enabled/i)).toBeTruthy();
  });

  it("leaves unrelated modules alone", () => {
    accessState.data = accessFor({ payroll: false });
    renderAt("/management/students");

    expect(screen.getByText("MODULE CONTENT")).toBeTruthy();
  });
});

describe("the block explains itself without leaking commercial detail", () => {
  beforeEach(() => {
    accessState.data = accessFor({ payroll: false });
  });

  it("names the module and says who to ask", () => {
    renderAt("/management/payroll/dashboard");
    expect(screen.getByText(/Payroll is not enabled/i)).toBeTruthy();
    expect(screen.getByText(/administrator/i)).toBeTruthy();
  });

  it("promises the data is still there", () => {
    // The first thought of someone who used this module yesterday is that
    // their records are gone. Revoking access never deletes anything, and the
    // screen has to say so.
    renderAt("/management/payroll/dashboard");
    expect(screen.getByText(/retained/i)).toBeTruthy();
  });

  it("never names the plan, the override or the platform", () => {
    renderAt("/management/payroll/dashboard");
    const body = document.body.textContent ?? "";
    for (const leak of ["plan", "Super Admin", "override", "withdrawn", "suspended"]) {
      expect(body.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});

describe("entitlement failure must never black out the portal", () => {
  it("allows everything while access is still loading", () => {
    accessState.data = accessFor({});
    accessState.isLoading = true;
    renderAt("/management/payroll/dashboard");
    expect(screen.getByText("MODULE CONTENT")).toBeTruthy();
  });

  it("allows everything when entitlements never resolved", () => {
    // The documented fail-open posture: one failed RPC must not lock a paying
    // school out of its own portal. Entitlement gates the UI; RLS guards data.
    accessState.data = accessFor({});
    renderAt("/management/payroll/dashboard");
    expect(screen.getByText("MODULE CONTENT")).toBeTruthy();
  });
});

describe("the super-role short-circuit never comes back", () => {
  it("does not return early on isSuper", () => {
    // Matches the statement, not the mere mention of `isSuper` — the header
    // comment discusses it at length and must not satisfy this gate.
    const shortCircuit = /if\s*\(\s*data\.isSuper\s*\)\s*return/;
    expect(
      shortCircuit.test(GATE_SRC),
      "LayoutAccessGate returns early for a super role again. SUPER_ROLES is " +
        "['management'], so this exempts a school's own administrator from every " +
        "entitlement check and makes revoking a module cosmetic.",
    ).toBe(false);
  });

  it("consults the module, not only the submodule and action", () => {
    // Entitlement is a module-level fact. Checking submodules alone falls open
    // on any route whose nav item carries no submodule id.
    expect(GATE_SRC).toMatch(/target\.module\s*\?\s*lookup\(/);
  });

  it("distinguishes an entitlement block from a permission block", () => {
    expect(GATE_SRC).toMatch(/source\s*===\s*"entitlement"/);
    expect(GATE_SRC).toMatch(/ModuleUnavailable/);
  });
});
